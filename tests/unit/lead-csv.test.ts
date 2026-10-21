import { describe, expect, it } from "vitest";
import {
  autoMapLeadColumns,
  checkLeadRow,
  leadMappingProblems,
  type LeadImportContext,
} from "@/features/leads/csv";

const ctx: LeadImportContext = {
  leadTypes: ["buyer", "tenant", "seller", "landlord", "investor"],
  areas: [{ id: "area-1", name: "Dubai Marina" }],
  listings: [{ id: "listing-1", reference: "HD-2041" }],
  phoneCountryCode: "+971",
  currencyDecimals: 2,
};

describe("lead CSV import", () => {
  const headers = [
    "Full name",
    "E-mail",
    "Mobile",
    "Type",
    "Buy or rent",
    "Budget max",
    "Bedrooms",
    "Area",
    "Ref",
    "Notes",
    "Tags",
  ];
  const columns = autoMapLeadColumns(headers);

  it("maps columns by header and checks the mapping", () => {
    expect(columns).toEqual([
      "name",
      "email",
      "phone",
      "type",
      "purpose",
      "budget_max",
      "beds",
      "area",
      "property_ref",
      "message",
      "tags",
    ]);
    expect(leadMappingProblems(columns)).toEqual([]);
    expect(leadMappingProblems(["email", null])).toEqual(["Map a column to Name."]);
    expect(leadMappingProblems(["name", "name"])).toEqual([
      "Map a column to Email or Phone, so each lead can be reached.",
      "Two columns are mapped to Name.",
    ]);
  });

  it("reads a good row, with gentle warnings for what it cannot place", () => {
    const check = checkLeadRow(
      [
        "Sara Khan",
        "SARA@example.com",
        "050 123 4567",
        "Investor",
        "Buy",
        "2,500,000",
        "2",
        "Dubai Marina",
        "hd-2041",
        "Wants a view",
        "vip; marina",
      ],
      columns,
      ctx,
    );
    expect(check).toEqual({
      errors: [],
      warnings: [],
      row: {
        name: "Sara Khan",
        email: "sara@example.com",
        phone: "+971501234567",
        type: "investor",
        purpose: "sale",
        budgetMin: null,
        budgetMax: 250_000_000,
        beds: 2,
        locationId: "area-1",
        propertyId: "listing-1",
        message: "Wants a view",
        sourceDetail: null,
        tags: ["vip", "marina"],
      },
    });
    const soft = checkLeadRow(
      ["Ben", "", "+447700900123", "boss", "", "", "lots", "Mars", "HD-9", "", ""],
      columns,
      ctx,
    );
    expect(soft.errors).toEqual([]);
    expect(soft.warnings).toEqual([
      'Lead type "boss" is not in Settings -> Leads; worked out instead',
      'Bedrooms "lots" were left out',
      'Area "Mars" is not in your locations; left out',
      "No listing HD-9; left out",
    ]);
  });

  it("refuses rows nobody could act on", () => {
    expect(checkLeadRow(["", "", "", "", "", "", "", "", "", "", ""], columns, ctx).errors).toEqual(
      ["No name", "No email or phone"],
    );
    expect(
      checkLeadRow(["X", "not-an-email", "12", "", "", "abc", "", "", "", "", ""], columns, ctx)
        .errors,
    ).toEqual([
      '"not-an-email" is not an email address',
      '"12" is not a phone number (add the country code)',
      "The budget is not a number",
    ]);
  });
});
