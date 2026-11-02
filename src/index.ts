interface Env {
	PB_URL: string;
	PB_WORKER_KEY: string;
	TURNSTILE_SITE_KEY: string;
	TURNSTILE_SECRET: string;
}

interface TurnstileResponse {
	success: boolean;
	hostname?: string;
	action?: string;
}

interface InviteRecord {
	url: string;
}

interface PocketBaseResponse {
	items?: InviteRecord[];
}

const ALLOWED_SOURCES = ["groups", "courses"];
const ALLOWED_PLATFORMS = ["telegram", "whatsapp"];

function validParams(source: string, id: string, platform: string): boolean {
	return (
		ALLOWED_SOURCES.includes(source) &&
		/^[a-zA-Z0-9]{1,30}$/.test(id) &&
		ALLOWED_PLATFORMS.includes(platform)
	);
}

function htmlResponse(html: string, status = 200): Response {
	return new Response(html, {
		status,
		headers: {
			"Content-Type": "text/html;charset=UTF-8",
			"Cache-Control": "no-store",
		},
	});
}

function errorPage(message: string, status = 400): Response {
	return htmlResponse(
		`<!doctype html>
		<html lang="es">
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width">
		<title>CCC · Verificación</title>
		<body style="font-family:system-ui;text-align:center;padding:3rem">
		<h2>No se pudo verificar</h2>
		<p>${message}</p>
		</body>
		</html>`,
		status
	);
}

function verificationPage(
	source: string,
	id: string,
	platform: string,
	siteKey: string,
	message = ""
): Response {
	return htmlResponse(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CCC · Verificar invitación</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:grid;place-items:center;min-height:100vh;margin:0;color:#222}
    main{background:white;padding:2rem;border-radius:16px;max-width:360px;width:calc(100% - 64px);text-align:center;box-shadow:0 8px 30px #0001}
    button{background:#2563eb;color:white;border:0;padding:12px 22px;border-radius:8px;font-size:16px;margin-top:18px;cursor:pointer}
    .error{color:#b91c1c}
  </style>
</head>
<body>
  <main>
    <h2>Acceso a la comunidad CCC</h2>
    <p>Completa la verificación para continuar a la invitación.</p>
    ${message ? `<p class="error">${message}</p>` : ""}
    <form method="POST">
      <input type="hidden" name="source" value="${source}">
      <input type="hidden" name="id" value="${id}">
      <input type="hidden" name="platform" value="${platform}">
      <div class="cf-turnstile" data-sitekey="${siteKey}"></div>
      <button type="submit">Verificar y continuar</button>
    </form>
  </main>
</body>
</html>`);
}

function safeInviteUrl(value: string, platform: string): boolean {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") return false;

		const hosts: Record<string, string[]> = {
			telegram: ["t.me", "telegram.me"],
			whatsapp: ["chat.whatsapp.com", "wa.me", "whatsapp.com"],
		};

		return hosts[platform]?.includes(url.hostname) ?? false;
	} catch {
		return false;
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const currentUrl = new URL(request.url);

		if (request.method === "GET") {
			const source = currentUrl.searchParams.get("source") ?? "";
			const id = currentUrl.searchParams.get("id") ?? "";
			const platform = currentUrl.searchParams.get("platform") ?? "";

			if (!validParams(source, id, platform)) {
				return errorPage("El enlace de invitación no es válido.");
			}

			return verificationPage(source, id, platform, env.TURNSTILE_SITE_KEY);
		}

		if (request.method !== "POST") {
			return errorPage("Método no permitido.", 405);
		}

		const form = await request.formData();

		const source = String(form.get("source") ?? "");
		const id = String(form.get("id") ?? "");
		const platform = String(form.get("platform") ?? "");
		const token = String(form.get("cf-turnstile-response") ?? "");

		if (!validParams(source, id, platform) || !token) {
			return errorPage("Faltan datos para verificar la invitación.");
		}

		const verification = await fetch(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					secret: env.TURNSTILE_SECRET,
					response: token,
				}),
			}
		);

		if (!verification.ok) {
			return errorPage("No se pudo validar el desafío.", 502);
		}

		const result = (await verification.json()) as TurnstileResponse;

		if (!result.success || result.hostname !== new URL(request.url).hostname) {
			return verificationPage(
				source,
				id,
				platform,
				env.TURNSTILE_SITE_KEY,
				"La verificación falló. Inténtalo nuevamente."
			);
		}

		const filter = `source="${source}" && record_id="${id}" && platform="${platform}"`;
		const apiUrl = new URL(
			`${env.PB_URL.replace(/\/$/, "")}/api/collections/invite_links/records`
		);

		apiUrl.searchParams.set("filter", filter);
		apiUrl.searchParams.set("perPage", "1");

		const pbResponse = await fetch(apiUrl, {
			headers: {
				"X-Worker-Key": env.PB_WORKER_KEY,
			},
		});

		if (!pbResponse.ok) {
			return errorPage("No se pudo consultar la invitación.", 502);
		}

		const data = (await pbResponse.json()) as PocketBaseResponse;
		const invite = data.items?.[0];

		if (!invite || !safeInviteUrl(invite.url, platform)) {
			return errorPage("La invitación no existe o ya no está disponible.", 404);
		}

		return Response.redirect(invite.url, 302);
	},
};
