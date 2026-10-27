# Villa Florencia: prototipo

App web para registrar los pagos en efectivo de vigilancia y mantenimiento, enviar avisos de cobro por WhatsApp, emitir recibos y reportes, y controlar visitas con códigos.

> **Estado: demo.** Los datos se guardan en el navegador (localStorage) y son de ejemplo. Lo que se cambia en un navegador no se ve en otro. El siguiente paso es conectar Firebase (ver abajo).

## Cómo abrirlo

1. Abre una terminal en esta carpeta.
2. La primera vez, ejecuta `npm install`.
3. Ejecuta `npm run dev` y abre http://localhost:5173

## Usuarios de prueba

Todos entran por la misma pantalla de login. Según el rol de la cuenta, la app lleva a cada usuario a su propia sección.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@villaflorencia.com` | `Admin2026!` |
| Vigilante | `vigilancia1@villaflorencia.com` | `Vigilante2026!` |
| Vigilante | `vigilancia2@villaflorencia.com` | `Vigilante2026!` |
| Residente: propietario, Polígono A, Lote 1 (al día) | `propietario.a1@villaflorencia.com` | `Residente2026!` |
| Residente: inquilino, Polígono A, Lote 2 | `inquilino.a2@villaflorencia.com` | `Residente2026!` |
| Residente: propietario, Polígono B, Lote 4 (en mora) | `propietario.b4@villaflorencia.com` | `Residente2026!` |

**Todos los residentes** de la demo tienen cuenta con la contraseña `Residente2026!`. Los correos siguen este formato:
- Propietario: `propietario.<polígono><lote>@villaflorencia.com`, por ejemplo `propietario.c5@villaflorencia.com`.
- Inquilino: `inquilino.<polígono><lote>@villaflorencia.com`. Solo existe en las casas que tienen inquilino: los lotes 2 y 5 de cada polígono.

El administrador puede crear, editar, desactivar o eliminar cuentas en **Usuarios**, y cambiar la contraseña de cualquiera.

> Estas contraseñas son solo para la demo. En la versión con Firebase, las contraseñas las guarda Firebase Auth cifradas, y cada usuario debe cambiar la suya en el primer ingreso.

## Acceso por rol

Las rutas de cada rol están protegidas por `src/components/RequireRole.tsx`:

| Ruta | Quién puede entrar |
|---|---|
| `/login` | Cualquiera (si ya inició sesión, lo manda a su inicio) |
| `/admin/...` | Solo administradores |
| `/vigilante` | Solo vigilantes |
| `/residente/...` | Solo residentes, y solo ven su propia casa |

- Sin sesión, cualquier ruta protegida manda al login. Al entrar, el usuario vuelve a la página que pedía si le corresponde.
- Si alguien abre una ruta de otro rol, lo redirige a su propio inicio.
- Si el administrador desactiva una cuenta o le cambia el rol, se aplica de inmediato.

## Qué incluye

| Usuario | Pantallas |
|---|---|
| Administrador | **Inicio:** resumen del mes. **Casas:** propietario, inquilino, a quién avisar, quién genera códigos, cuota especial y saldo anterior. **Pagos:** registrar pago en efectivo y recibo PDF. **Avisos WhatsApp.** **Reportes:** ingresos, mora y estado de cuenta en PDF y Excel. **Usuarios.** **Configuración.** |
| Residente | **Mi cuenta:** cuotas, saldo y recibos. **Mis visitas:** generar y compartir códigos. |
| Vigilante | **Caseta:** verificar el código, buscar por nombre o DUI y dar entrada. |

**Reglas configuradas:** cuota de $22.00 mensual, vence el día 30 (en febrero, el último día del mes) y el aviso anticipado sale 3 días antes. Todo se puede cambiar en Configuración.

**Probar otras fechas:** en Configuración → Herramientas de la demo puedes simular la fecha de hoy. Por ejemplo, al poner 01/11 se generan las cuotas de noviembre y el reporte de cierre de octubre, como lo harán las tareas automáticas. Ahí también está **Reiniciar datos de ejemplo**, que restaura los usuarios de esta tabla.

## Estructura

```
src/lib/types.ts                modelo de datos (equivale a las colecciones de Firestore)
src/lib/store.ts                almacenamiento y sesión: lo único que cambia al conectar Firebase
src/lib/billing.ts              cuotas, aplicación de pagos, cola de avisos, códigos de visita
src/lib/reports.ts              cálculos de reportes
src/lib/pdf.ts                  recibos, estados de cuenta y reportes en PDF y Excel (CSV)
src/lib/whatsapp.ts             mensajes y enlaces de WhatsApp
src/lib/seed.ts                 datos y usuarios de ejemplo, textos de los mensajes
src/components/RequireRole.tsx  protección de rutas por rol
src/pages/                      pantallas por tipo de usuario
```

## Siguiente fase: Firebase (plan Blaze, uso dentro de la capa gratuita)

- Firebase Auth con correo y contraseña. El rol se guarda en la cuenta (*custom claims*) y el administrador crea las cuentas desde la app.
- Firestore en lugar de localStorage, con reglas en el servidor que repiten la protección por rol: un residente no puede leer otra casa y un vigilante solo ve visitas.
- Cloud Functions programadas: cuotas el día 1, cola de avisos diaria y reporte de cierre mensual. También el registro de pagos en el servidor, para que el número de recibo nunca se repita.
- Firebase Hosting para publicar la app con su propio enlace.
