import { describe, expect, it } from "vitest";
import { htmlToText, webFetchHost } from "./web-fetch-tool.js";

describe("htmlToText", () => {
  it("extracts the title and reduces structure to markdown-ish text", () => {
    const { title, text } = htmlToText(
      `<html><head><title>My  Page</title><style>p{color:red}</style></head>
       <body><h1>Hello</h1><p>First paragraph.</p>
       <ul><li>one</li><li>two</li></ul></body></html>`,
    );
    expect(title).toBe("My Page");
    expect(text).toContain("# Hello");
    expect(text).toContain("First paragraph.");
    expect(text).toContain("- one");
    expect(text).not.toContain("color:red");
  });

  it("drops scripts and comments, keeps link destinations", () => {
    const { text } = htmlToText(
      `<script>alert(1)</script><!-- hidden -->
       <p>See <a href="https://example.com/docs">the docs</a> and
       <a href="#local">anchors</a>.</p>`,
    );
    expect(text).toContain("[the docs](https://example.com/docs)");
    expect(text).toContain("anchors");
    expect(text).not.toContain("alert(1)");
    expect(text).not.toContain("hidden");
  });

  it("decodes entities and collapses whitespace", () => {
    const { text } = htmlToText("<p>a &amp; b&nbsp;&mdash; &#x2764; &#169;</p>");
    expect(text).toBe("a & b — ❤ ©");
  });
});

describe("webFetchHost", () => {
  it("returns the hostname of a valid url", () => {
    expect(webFetchHost({ url: "https://example.com/path?q=1" })).toBe(
      "example.com",
    );
  });

  it("returns null for malformed or missing urls", () => {
    expect(webFetchHost({ url: "not a url" })).toBeNull();
    expect(webFetchHost({})).toBeNull();
  });
});
