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
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<meta name="theme-color" content="#0d1117">
			<title>CCC · Verificación</title>
			<script src="https://cdn.tailwindcss.com"></script>
		</head>

		<body class="min-h-screen flex items-center justify-center bg-[#0d1117] px-5 py-10 text-white">
			<div class="fixed inset-0 overflow-hidden pointer-events-none">
				<div class="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl"></div>
				<div class="absolute -bottom-32 -right-32 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl"></div>
			</div>

			<main class="w-full max-w-md bg-white border border-white/10 rounded-3xl p-8 sm:p-10 text-center shadow-2xl">
				<h1 class="text-2xl font-extrabold text-slate-900 tracking-tight mb-3">
					No se pudo verificar
				</h1>

				<p class="text-slate-500 text-sm leading-relaxed mb-8">
					${message}
				</p>

				<button onclick="history.back()"
					class="w-full max-w-[320px] bg-[#138dff] hover:bg-[#1075d6] active:scale-[0.98] text-white font-bold py-4 px-2 rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200">
					Volver e intentar nuevamente
				</button>

				<div class="border-t border-slate-100 mt-8 pt-6">
					<p class="text-xs text-slate-400">
						<span class="font-semibold text-slate-600">CCC x OSUC · Sistema Antibots</span><br>
						Invitaciones protegidas mediante Cloudflare.
					</p>
				</div>
			</main>
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
  <meta name="theme-color" content="#0f172a">
  <title>CCC · Verificar invitación</title>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>

<body class="min-h-screen flex items-center justify-center bg-[#0d1117] px-5 py-10">

  <div class="fixed inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/30 rounded-full blur-3xl"></div>
    <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl"></div>
  </div>

  <main class="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center">
    <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
      Accede a la comunidad del DCC UC
    </h1>

    <p class="text-slate-500 text-base leading-relaxed mb-7">
      Estás a un paso de unirte al grupo de ${platform}.
      Completa esta pequeña verificación para continuar.
    </p>

    ${
			message
				? `
      <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-5">
        ${message}
      </div>
    `
				: ""
		}

    <form method="POST">
		<input type="hidden" name="source" value="${source}">
		<input type="hidden" name="id" value="${id}">
		<input type="hidden" name="platform" value="${platform}">

		<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="light"></div>

      	<button type="submit"
			class="w-full max-w-[320px] mt-6 bg-[#138dff] hover:bg-[#1075d6] active:scale-[0.98] text-white font-bold py-4 px-2 rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200">
			Verificar y continuar
		</button>
    </form>

    <div class="border-t border-slate-100 mt-8 pt-6">
      <p class="text-xs text-slate-400">
        <span class="font-semibold text-slate-600">CCC x OSUC · Sistema Antibots</span><br>
        Invitaciones protegidas mediante Cloudflare.
      </p>
    </div>

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

		if (!invite) {
			return errorPage("No se pudo encontrar la invitación.", 404);
		}

		if (!safeInviteUrl(invite.url, platform)) {
			return errorPage("La URL de invitación no está permitida.", 400);
		}

		if (!invite || !safeInviteUrl(invite.url, platform)) {
			return errorPage("La invitación no existe o ya no está disponible.", 404);
		}

		return Response.redirect(invite.url, 302);
	},
};
