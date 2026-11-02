# CCC Invite Verifier

Sistema de verificación y distribución de invitaciones para la comunidad del DCC UC.

El proyecto utiliza Cloudflare Workers, Cloudflare Turnstile y PocketBase para controlar el acceso a las invitaciones, evitando que puedan obtenerse mediante solicitudes automatizadas o consultas no autorizadas.

## 1. Arquitectura general

El sistema está compuesto por tres servicios:

| Servicio | Responsabilidad |
|---|---|
| Cloudflare Turnstile | Verifica que las solicitudes sean realizadas por usuarios que superaron el desafío antibots. |
| Cloudflare Workers | Ejecuta la lógica de verificación y controla el acceso a las invitaciones. |
| PocketBase | Almacena las invitaciones y permite su administración. |

El Worker funciona como intermediario entre el usuario y PocketBase. Los usuarios nunca deberían necesitar acceso directo a las credenciales internas de la base de datos.

## 2. Flujo de funcionamiento

El proceso de obtención de una invitación funciona de la siguiente manera:

1. El usuario accede a la página de verificación.
2. Se carga el widget de Cloudflare Turnstile.
3. El usuario completa el desafío antibots.
4. El navegador envía el formulario al Worker junto con el token generado por Turnstile.
5. El Worker verifica el token directamente con la API de Cloudflare.
6. Si la verificación es satisfactoria, el Worker comprueba la autorización de la solicitud.
7. El Worker consulta PocketBase utilizando sus credenciales internas.
8. Se procesa la invitación y se devuelve el resultado al usuario.

Si alguno de los pasos de validación falla, la solicitud no debe continuar con la entrega de la invitación.

## 3. Variables de entorno y secretos

El funcionamiento del sistema requiere algunas credenciales que permiten comunicar los distintos servicios.

Estas credenciales deben configurarse en el entorno de ejecución del Worker y nunca deben incluirse directamente en el código fuente.

### `PB_WORKER_KEY`

Esta variable contiene una credencial privada utilizada para autorizar las operaciones del Worker sobre PocketBase.

Su propósito es establecer una separación entre el acceso público y el acceso interno del servicio:

- Los usuarios pueden interactuar con el sistema de verificación.
- El Worker puede realizar las operaciones autorizadas sobre PocketBase.
- Los usuarios no reciben ni necesitan conocer esta credencial para obtener una invitación.

En otras palabras, `PB_WORKER_KEY` permite que el backend se identifique ante el mecanismo de autorización configurado para la base de datos.

**Consideraciones de seguridad:**

- No debe exponerse en el frontend.
- No debe enviarse como parte de las respuestas HTTP al usuario.
- No debe almacenarse en archivos versionados.
- No debe incluirse en logs públicos.
- Debe configurarse como secreto del entorno del Worker.

El nombre de la variable puede ser público; su valor debe permanecer privado.

### Cloudflare Turnstile

El sistema utiliza dos claves proporcionadas por Cloudflare:

| Variable / dato | Uso | Exposición |
|---|---|---|
| `TURNSTILE_SITE_KEY` | Identifica el widget en el frontend. | Pública |
| `TURNSTILE_SECRET_KEY` | Permite validar los tokens desde el backend. | Privada |

La Site Key se utiliza para renderizar el widget y puede estar presente en el HTML.

La Secret Key se utiliza exclusivamente desde el Worker para comunicarse con el servicio de validación de Cloudflare.

Nunca se debe intercambiar el propósito de ambas claves.

### Otras credenciales

Cualquier credencial necesaria para conectar PocketBase u otros servicios debe seguir el mismo principio: permanecer en el backend y configurarse mediante secretos o variables de entorno.

Los nombres y valores reales de las credenciales de producción no forman parte de esta documentación.

## 4. ¿Por qué PocketBase no permite acceder directamente a las invitaciones?

Una de las decisiones de seguridad del proyecto es evitar que las invitaciones estén disponibles mediante consultas públicas.

PocketBase almacena los datos, pero el acceso a las operaciones de distribución está restringido.

El Worker actúa como intermediario autorizado y utiliza su credencial interna para ejecutar las operaciones correspondientes.

Esto permite separar dos niveles de acceso:

**Acceso público**
- Visualizar el formulario.
- Completar la verificación.
- Solicitar una invitación.

**Acceso interno**
- Consultar las invitaciones.
- Ejecutar operaciones autorizadas sobre los registros.
- Gestionar la comunicación con PocketBase.

La credencial `PB_WORKER_KEY` forma parte de este mecanismo de separación.

Por lo tanto, conocer la URL pública de PocketBase no debería ser suficiente para obtener invitaciones.


### Configuración de las API Rules de PocketBase

La protección de las invitaciones se implementa mediante las reglas de acceso (*API Rules*) de PocketBase.

En particular, la regla **List/Search Rule** de la colección que almacena las invitaciones debe configurarse para exigir la credencial interna utilizada por el Worker.

El mecanismo funciona de la siguiente manera:

1. Acceder al panel de administración de PocketBase.
2. Abrir la colección que almacena las invitaciones.
3. Ingresar a la sección **API Rules**.
4. Localizar el campo **List/Search Rule**.
5. Configurar la regla para que las consultas solo sean permitidas cuando se presente la credencial interna correspondiente: `@request.headers.x_worker_key = "CREDENCIAL"`.
6. Guardar los cambios.

La variable `PB_WORKER_KEY` contiene el valor que utiliza el Worker para satisfacer esta condición de autorización.

De esta forma:

- Una consulta pública sin la credencial correspondiente no puede listar ni buscar invitaciones.
- El Worker puede realizar las consultas autorizadas utilizando `PB_WORKER_KEY`.
- El valor de la credencial nunca necesita exponerse al frontend.

**Importante:** el valor de `PB_WORKER_KEY` debe mantenerse privado y coincidir con el valor esperado por la regla configurada en PocketBase. No debe copiarse en documentación pública, capturas de pantalla ni archivos versionados.

La regla debe configurarse de acuerdo con el mecanismo de autenticación implementado por el Worker. No basta con ocultar la URL de PocketBase: la protección efectiva depende de las API Rules y de la validación de la credencial.

## 5. Configuración de una nueva instancia

Para desplegar una instancia independiente del proyecto se necesita:

1. Crear una cuenta de Cloudflare.
2. Crear un widget de Cloudflare Turnstile.
3. Obtener la Site Key y la Secret Key.
4. Crear o configurar una instancia de PocketBase.
5. Configurar los permisos y mecanismos de autorización necesarios para restringir el acceso a las invitaciones.
6. Generar y configurar una credencial privada para la comunicación entre el Worker y PocketBase.
7. Configurar las variables de entorno y secretos del Worker.
8. Desplegar el servicio.
9. Actualizar la URL del endpoint de verificación en el sistema que lo consuma.
10. Probar el flujo completo de verificación y entrega de invitaciones.

Cada instalación debe utilizar sus propias credenciales. No se deben reutilizar secretos de una instancia de producción en entornos de desarrollo o pruebas.

## 6. Seguridad y buenas prácticas

Al trabajar con el proyecto:

- Nunca subir archivos `.env` con credenciales reales.
- No publicar valores de `PB_WORKER_KEY`.
- No publicar la Secret Key de Turnstile.
- No incluir tokens de acceso en el código fuente.
- Mantener restringidas las reglas de acceso de PocketBase.
- Validar los tokens de Turnstile desde el backend.
- No confiar en parámetros enviados por el navegador para autorizar operaciones.
- Utilizar secretos independientes para desarrollo y producción.
- Rotar las credenciales si existe sospecha de exposición.

Si una credencial llega a publicarse accidentalmente, debe considerarse comprometida y reemplazarse.

## 7. Tecnologías utilizadas

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [PocketBase](https://pocketbase.io/)
- [Tailwind CSS](https://tailwindcss.com/)
