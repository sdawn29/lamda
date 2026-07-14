import { describe, expect, it } from "vitest";
import {
  formatWebFetchMarkdown,
  htmlToMarkdown,
  webFetchHost,
} from "./web-fetch-tool.js";

describe("htmlToMarkdown", () => {
  it("extracts the title and reduces structure to markdown", () => {
    const { title, markdown } = htmlToMarkdown(
      `<html><head><title>My  Page</title><style>p{color:red}</style></head>
       <body><h1>Hello</h1><p>First paragraph.</p>
       <ul><li>one</li><li>two</li></ul></body></html>`,
    );
    expect(title).toBe("My Page");
    expect(markdown).toContain("# Hello");
    expect(markdown).toContain("First paragraph.");
    expect(markdown).toContain("- one");
    expect(markdown).not.toContain("color:red");
  });

  it("drops scripts and comments, keeps link destinations", () => {
    const { markdown } = htmlToMarkdown(
      `<script>alert(1)</script><!-- hidden -->
       <p>See <a href="https://example.com/docs">the docs</a> and
       <a href="#local">anchors</a>.</p>`,
    );
    expect(markdown).toContain("[the docs](https://example.com/docs)");
    expect(markdown).toContain("anchors");
    expect(markdown).not.toContain("alert(1)");
    expect(markdown).not.toContain("hidden");
  });

  it("decodes entities and collapses whitespace", () => {
    const { markdown } = htmlToMarkdown(
      "<p>a &amp; b&nbsp;&mdash; &#x2764; &#169;</p>",
    );
    expect(markdown).toBe("a & b — ❤ ©");
  });
});

describe("formatWebFetchMarkdown", () => {
  it("returns metadata and fetched content as markdown instead of JSON", () => {
    const output = formatWebFetchMarkdown({
      url: "https://example.com/docs",
      status: 200,
      contentType: "text/html",
      title: "Example docs",
      content: "## Install\n\nRun `npm install`.",
      totalLength: 29,
      offset: 0,
      truncated: false,
      capped: false,
    });

    expect(output).toContain("# Example docs");
    expect(output).toContain("- Source: <https://example.com/docs>");
    expect(output).toContain("## Install\n\nRun `npm install`.");
    expect(output).not.toContain("\\n");
    expect(output).not.toMatch(/^\{/);
  });

  it("includes markdown pagination guidance for truncated content", () => {
    const output = formatWebFetchMarkdown({
      url: "https://example.com/long",
      status: 200,
      contentType: "text/plain",
      title: null,
      content: "second page",
      totalLength: 80_000,
      offset: 40_000,
      truncated: true,
      capped: false,
    });

    expect(output).toContain("# Fetched content");
    expect(output).toContain("characters 40000–40011 of 80000");
    expect(output).toContain("`offset=40011`");
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
