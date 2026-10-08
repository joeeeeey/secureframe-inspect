# Official API and runtime notes

Reviewed 2026-10-08. Public documentation is authoritative for the target account/version.

## [Secureframe API](https://api.secureframe.com/docs)

Authorization is key + space + secret; documented pagination uses page and per_page, not page[size].

## [Official MCP](https://mcp.secureframe.com/mcp_docs)

Official HTTP MCP endpoint is https://mcp.secureframe.com/; permissions and authentication remain provider-controlled.

## Boundaries

Python 3.10+. `SECUREFRAME_API_KEY` + `SECUREFRAME_API_SECRET`, their `_FILE` equivalents, or `SECUREFRAME_AUTH`. No implicit credential-file search. Optional `SECUREFRAME_API_BASE=https://api-uk.secureframe.com`; US is default.

Read-only REST implementation plus optional Playwright session/query-metadata capture. No evidence upload or mutation executor. The official MCP server is an optional alternative described in references/api.md; this package does not configure it or claim to test it. Baselines are not an atomic snapshot and contain no per-item evidence.

HTTP helpers do not follow redirects or automatically retry writes. A timeout can mean an unknown outcome; inspect the target before retrying. Secret-field redaction is defense in depth, not a guarantee that arbitrary free text is safe to publish.
