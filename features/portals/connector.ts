import { parsePortalEmail, type PortalLead } from "./email-parser";

/**
 * Property portals (13 §1): one connector interface; the demo build uses email parsing and
 * CSV import. Real API connectors are added when an agency brings its own credentials.
 */
export type RawPortalLead = Record<string, unknown>;

export interface PortalConnector {
  readonly key: string;
  readonly name: string;
  /** Leads since a moment (pulled connectors); push connectors return nothing here. */
  fetchLeads(since: Date): Promise<RawPortalLead[]>;
  normaliseLead(raw: RawPortalLead): PortalLead | null;
  pushListing?(listing: { id: string; reference: string }): Promise<void>;
}

/**
 * Portal emails forwarded to the portal inbox (Settings -> Leads). They arrive pushed, by the
 * inbound email webhook, so there is nothing to fetch.
 */
export class EmailParsingConnector implements PortalConnector {
  constructor(
    readonly key: string,
    readonly name: string,
    private readonly referencePrefix: string | null = null,
  ) {}
  async fetchLeads(): Promise<RawPortalLead[]> {
    return [];
  }
  normaliseLead(raw: RawPortalLead): PortalLead | null {
    const lead = parsePortalEmail({
      subject: String(raw.subject ?? ""),
      text: String(raw.text ?? ""),
      referencePrefix: this.referencePrefix,
    });
    return lead.email || lead.phone ? lead : null;
  }
}

/** A row of a portal's lead export, with its columns already mapped. */
export class CsvConnector implements PortalConnector {
  constructor(
    readonly key: string,
    readonly name: string,
  ) {}
  async fetchLeads(): Promise<RawPortalLead[]> {
    return [];
  }
  normaliseLead(raw: RawPortalLead): PortalLead | null {
    const text = (k: string) => {
      const v = raw[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const lead: PortalLead = {
      name: text("name"),
      email: text("email")?.toLowerCase() ?? null,
      phone: text("phone"),
      reference: text("reference"),
      message: text("message"),
    };
    return lead.email || lead.phone ? lead : null;
  }
}

/** An API connector not built yet: it says so instead of pretending (no fake data). */
class ApiConnectorStub implements PortalConnector {
  constructor(
    readonly key: string,
    readonly name: string,
    private readonly notes: string,
  ) {}
  async fetchLeads(): Promise<RawPortalLead[]> {
    throw new Error(
      `${this.name}: the API connector is not built yet (${this.notes}). Forward its lead emails to the portal inbox or import its CSV export.`,
    );
  }
  normaliseLead(): PortalLead | null {
    return null;
  }
}

/**
 * API connectors, one stub per portal. TODO for each, when an agency brings credentials:
 * fetchLeads (their leads API, paged since a time), normaliseLead (their field names) and
 * pushListing (their listing feed or API).
 */
export const apiConnectors: Record<string, PortalConnector> = {
  // TODO Property Finder (UAE, Qatar, Bahrain, Egypt, KSA): Enterprise API, OAuth client credentials.
  property_finder: new ApiConnectorStub("property_finder", "Property Finder", "Enterprise API"),
  // TODO Bayut / dubizzle (UAE): partner API and XML feed for listings.
  bayut: new ApiConnectorStub("bayut", "Bayut", "partner API"),
  dubizzle: new ApiConnectorStub("dubizzle", "dubizzle", "partner API"),
  // TODO Rightmove (UK): Real Time Datafeed for listings, lead emails or the leads API.
  rightmove: new ApiConnectorStub("rightmove", "Rightmove", "Real Time Datafeed"),
  // TODO Zoopla (UK): Zoopla Pro APIs for listings and enquiries.
  zoopla: new ApiConnectorStub("zoopla", "Zoopla", "Zoopla Pro API"),
};
