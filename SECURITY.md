# Security Policy

## Supported Versions

Only the **latest release** receives security fixes. Please update before reporting.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please open a **[private security advisory](https://github.com/mxkissnr/glp-integration/security/advisories/new)** on GitHub and include:

- A clear description of the vulnerability
- Steps to reproduce (proof-of-concept if possible)
- Potential impact

I will acknowledge your report within **7 days** and aim to release a fix within **30 days** depending on severity.

## Scope

This integration runs locally inside Home Assistant and communicates only with the GLP app on the same instance. The primary attack surface is:

- HTTP requests to the GLP app API (token-authenticated)
- Entity attribute data (JSON from the app)
- The HA config entry (stores the app URL)

Out of scope: vulnerabilities in Home Assistant itself or the GLP app (report those in their respective repositories).
