# Villa Florencia

App web para registrar los pagos en efectivo de vigilancia y mantenimiento, enviar avisos de cobro por WhatsApp, emitir recibos y reportes, y controlar visitas con códigos.

Los datos están en **Firebase**: Authentication guarda las cuentas y Firestore guarda los datos. Todos los dispositivos ven la misma información en tiempo real. Funciona en el plan gratuito **Spark** de Firebase, sin tarjeta.

## Usuarios y acceso por rol

Hay una sola pantalla de login. Según el rol de la cuenta, cada usuario va a su sección:

| Ruta | Quién puede entrar | Qué ve |
|---|---|---|
| `/admin/...` | Administradores | Todo: casas, pagos, avisos, reportes, usuarios, configuración |
| `/vigilante` | Vigilantes | Casas y visitas del día. Solo puede marcar la entrada. |
| `/residente/...` | Propietarios e inquilinos | Solo su casa: cuotas, recibos y sus visitas |

La protección funciona en dos niveles:
- **En la app** (`src/components/RequireRole.tsx`): manda a cada quien a su sección.
- **En el servidor** (`firestore.rules`): Firestore rechaza cualquier lectura o escritura que el rol no permita, aunque alguien modifique la app en su navegador.

**Cuentas:**
- **Primera vez:** la app muestra la pantalla de **Configuración inicial**, donde se crea la residencial y la cuenta del administrador principal. Solo se puede hacer una vez.
- **Demás cuentas:** el administrador las crea en **Usuarios** con una contraseña inicial.
- **Cambiar la contraseña:** cada persona lo hace con **"Olvidé mi contraseña"** en el login. El administrador también puede enviarle el enlace por correo desde Usuarios.

## Probar en esta computadora (emuladores, sin tocar la nube)

Con `npm run dev:local`, la app usa los emuladores locales de Firebase en lugar del proyecto real. Se necesita Java (ya instalado). `npm run dev`, en cambio, usa el proyecto real.

1. En una terminal: `npm run emulators` (deja la ventana abierta).
2. En otra: `npm run dev:local` y abre http://localhost:5173
3. La primera vez aparece la Configuración inicial. Puedes marcar **Cargar datos de ejemplo**.

Cuentas de prueba usadas en los emuladores (solo existen en esta computadora):

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@prueba.test` | `Prueba2026!` |
| Vigilante | `vigilante@prueba.test` | `Prueba2026!` |
| Residente (inquilino, Polígono A, Lote 2) | `inquilino@prueba.test` | `Prueba2026!` |

Los datos de los emuladores se borran al cerrarlos. Se ven en http://127.0.0.1:4000 mientras están abiertos.

**Pruebas automáticas de seguridad:** `npm run test:rules` verifica en el emulador que cada rol solo pueda leer y escribir lo que le corresponde.

## Proyecto de Firebase

- **Proyecto:** `villaflorencia-c1844`, en el plan Spark. Su configuración web está en `src/firebase-config.ts`.
- **Requisitos en la consola:**
  - **Authentication** con **Correo/contraseña** activado.
  - **Firestore Database** creada.
  - `hreino92.github.io` en **Authentication → Configuración → Dominios autorizados**.
- **Reglas de seguridad:** se publican cada vez que cambia `firestore.rules`. Hay dos formas:
  - Copiar el archivo en **Firestore → Reglas** y presionar **Publicar**.
  - O desde la terminal: `npx firebase login` y después `npm run deploy:rules`.

## Publicación (GitHub Pages)

La app está publicada en **https://hreino92.github.io/villaflorencia/**. Cada vez que se suben cambios a `main`, GitHub la compila y publica sola (`.github/workflows/deploy.yml`).

## Reglas de cobro

La cuota es de $22.00 mensual y vence el día 30 (en febrero, el último día del mes). El aviso anticipado sale 3 días antes. Todo se cambia en Configuración.

Las cuotas del mes, el saldo a favor y el reporte de cierre se generan automáticamente cuando un administrador abre la app. Los números de recibo se asignan en una transacción de Firestore, así que nunca se repiten aunque cobren dos administradores a la vez.

## Estructura

```
src/firebase-config.ts          configuración web del proyecto de Firebase
src/lib/firebase.ts             conexión a Firebase (y a los emuladores en modo de pruebas)
src/lib/store.ts                sincronización con Firestore, sesión, pagos y configuración inicial
src/lib/types.ts                modelo de datos (una colección de Firestore por lista)
src/lib/billing.ts              cuotas, aplicación de pagos, cola de avisos, códigos de visita
src/lib/reports.ts              cálculos de reportes
src/lib/pdf.ts                  recibos, estados de cuenta y reportes en PDF y Excel (CSV)
src/lib/whatsapp.ts             mensajes y enlaces de WhatsApp
src/lib/seed.ts                 datos de ejemplo y textos de los mensajes
src/components/RequireRole.tsx  protección de rutas por rol
src/pages/                      pantallas por tipo de usuario
firestore.rules                 reglas de seguridad del servidor
tests/rules.test.mjs            pruebas de las reglas
```
