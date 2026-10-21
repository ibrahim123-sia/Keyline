import { describe, expect, it } from "vitest";
import { CsvConnector, EmailParsingConnector, apiConnectors } from "@/features/portals/connector";
import { guessPortalMapping, readPortalCsv, rowToRaw } from "@/features/portals/csv";
import { htmlToText, parsePortalEmail, stripQuotedReply } from "@/features/portals/email-parser";

describe("portal lead emails", () => {
  it("labelled layout: 'Label: value' lines, a message running over lines", () => {
    const text = [
      "You have received a new lead for your listing.",
      "",
      "Name: Sam Visitor",
      "Email: Sam@Example.com",
      "Phone: +971 50 123 4567",
      "Reference: HD-2041",
      "Message: Is it still available?",
      "We would like to view on Saturday.",
      "",
      "Kind regards, the portal team",
    ].join("\n");
    expect(parsePortalEmail({ subject: "New enquiry", text })).toEqual({
      name: "Sam Visitor",
      email: "sam@example.com",
      phone: "+971501234567",
      reference: "HD-2041",
      message:
        "Is it still available? We would like to view on Saturday. Kind regards, the portal team",
      layout: "labelled",
    });
  });

  it("stacked layout from an HTML table: label on one line, value on the next", () => {
    const html = `<table>
      <tr><td>Customer name</td></tr><tr><td>Rania Saleh</td></tr>
      <tr><td>Mobile</td></tr><tr><td>050 777 8888</td></tr>
      <tr><td>E-mail address</td></tr><tr><td>rania@example.com</td></tr>
      <tr><td>Property reference</td></tr><tr><td>hd-1003</td></tr>
      <tr><td>Comments</td></tr><tr><td>Three beds please</td></tr></table>`;
    const lead = parsePortalEmail({ subject: "Lead", text: htmlToText(html) });
    expect(lead).toMatchObject({
      layout: "stacked",
      name: "Rania Saleh",
      email: "rania@example.com",
      phone: "0507778888",
      reference: "hd-1003",
      message: "Three beds please",
    });
  });

  it("two-column table rows and the generic fallback", () => {
    const rows = htmlToText(
      "<table><tr><td>Name</td><td>Lee Chan</td></tr><tr><td>Tel</td><td>+44 20 7946 0000</td></tr></table>",
    );
    expect(parsePortalEmail({ subject: "x", text: rows })).toMatchObject({
      name: "Lee Chan",
      phone: "+442079460000",
    });
    // No labels at all: whatever looks like an email, phone and reference.
    expect(
      parsePortalEmail({
        subject: "Enquiry about HD-1009",
        text: "Please call me back on +971 55 111 2222 or write to me@example.org",
        referencePrefix: "HD",
      }),
    ).toEqual({
      name: null,
      email: "me@example.org",
      phone: "+971551112222",
      reference: "HD-1009",
      message: null,
      layout: "generic",
    });
  });

  it("replies: the new text without the quoted history", () => {
    expect(
      stripQuotedReply("Saturday works.\n\nOn Mon, 20 Oct 2026, Layla wrote:\n> When suits?"),
    ).toBe("Saturday works.");
    expect(stripQuotedReply("Yes\n-----Original Message-----\nFrom: x")).toBe("Yes");
    expect(stripQuotedReply("> only quoted")).toBe("> only quoted");
  });
});

describe("portal connectors and CSV", () => {
  it("email and CSV connectors need a way to reach the lead; API stubs say they are not built", async () => {
    const email = new EmailParsingConnector("pf", "Property Finder");
    expect(email.normaliseLead({ subject: "", text: "Name: Nobody" })).toBeNull();
    expect(await email.fetchLeads()).toEqual([]);
    const csv = new CsvConnector("pf", "Property Finder");
    expect(csv.normaliseLead({ name: "Sam", email: "SAM@x.example" })).toMatchObject({
      email: "sam@x.example",
    });
    await expect(apiConnectors.property_finder!.fetchLeads(new Date())).rejects.toThrow(
      /not built yet/,
    );
  });

  it("guesses columns from the header", () => {
    const { headers, rows } = readPortalCsv(
      "﻿Lead Name,E-mail,Mobile Number,Listing Ref,Comments\nSam,sam@x.example,0501234567,HD-1,Hi\n,,,,\n",
    );
    const mapping = guessPortalMapping(headers);
    expect(mapping).toEqual({ name: 0, email: 1, phone: 2, reference: 3, message: 4 });
    expect(rows).toHaveLength(1);
    expect(rowToRaw(rows[0]!, mapping)).toEqual({
      name: "Sam",
      email: "sam@x.example",
      phone: "0501234567",
      reference: "HD-1",
      message: "Hi",
    });
  });
});
