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
- The two bundled Lovelace cards, which run in the dashboard browser

On Supervisor installs the config flow calls the Supervisor API
(`http://supervisor/addons` and the add-on info endpoint) to auto-discover
the app and its host port, authenticating with Home Assistant's own
Supervisor token. The integration also serves the bundled Lovelace cards
and the `/api/glp/*` proxy views inside Home Assistant.

### Bundled cards

The Shot Card (`cards/shot/src/glp-card.ts`) and the Order Card
(`cards/order/src/glp-order-card.ts`) are served from
`custom_components/gaggiuino_profiler/www/`. They read Home Assistant state
(`hass.states`) and render it into their shadow DOM; every interpolated value
goes through Lit, which escapes it. The few `unsafeHTML`/`unsafeSVG` call
sites are limited to fixed icon and machine-glyph markup, as well as helpers
that escape their own input. The only browser storage they write is the
chosen switch entity id (`localStorage` key `glp_switch_entity` and its
machine-scoped variant) in the Shot Card.

The Shot Card calls these Home Assistant services:

- `switch.toggle` on the resolved power switch entity (power button)
- `gaggiuino_profiler.set_ready_by` (set or cancel the ready-by preheat time)
- `select.select_option` on `select.<prefix>profile` (profile picker)
- `gaggiuino_profiler.maintenance_done` (confirmed maintenance row)

and these requests through the integration proxy, using
`hass.fetchWithAuth` (the browser's Home Assistant session):

- `GET /api/glp/orders` for the barista order list (polled every 6 s)
- `POST /api/glp/orders/<id>/accept|complete|decline` for order actions
- `GET /api/glp/library/beans-info` for bean metadata

The Order Card uses the same proxy in zero-config mode (`hass.fetchWithAuth`)
for `api/orders/menu`, `api/orders/settings`, `api/orders/queue-eta`,
`api/orders/active-beans`, `api/orders/mine`, `api/shots/<id>` and
`POST api/orders` to place an order — the card's `api/` prefix is rewritten
to `/api/glp/`. With an explicit
`glp_url` it talks to the app directly instead, sending `X-GLP-Token` from
the `glp_token` YAML option or from the app's `/api/token` endpoint.

Home Assistant's auth token is never stored by either card: it is passed per
request to `hass.fetchWithAuth`, which adds the bearer header in the browser.
The GLP API token, when used, lives in memory for the page's lifetime only.

Out of scope: vulnerabilities in Home Assistant itself or the GLP app (report those in their respective repositories).
