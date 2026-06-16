# Agenda de Citas

Aplicación web para agendar citas con calendario, horarios disponibles, validaciones obligatorias, backend en Node.js con Express, base de datos SQLite y confirmación por correo con Nodemailer.

## Características

- Interfaz moderna y responsive en español.
- Calendario para seleccionar fecha.
- Horarios disponibles dinámicos.
- Formulario con nombre, correo y teléfono.
- Validaciones en frontend y backend.
- Guardado de citas en SQLite.
- No permite reservar un horario ocupado.
- Envía correo de confirmación al correo ingresado por el usuario.
- API REST:
  - `POST /agendar`
  - `GET /citas/:fecha`

## Instalación

1. Copia `.env.example` a `.env`.
2. Configura tus credenciales SMTP.
3. Instala dependencias:

```bash
npm install
```

4. Inicia el servidor:

```bash
npm start
```

5. Abre `http://localhost:3000`.

## Variables de entorno

- `PORT`: puerto del servidor.
- `DB_FILE`: ruta del archivo SQLite.
- `SITE_URL`: URL pública para confirmar cita.
- `FROM_EMAIL`: correo remitente.
- `SMTP_HOST`: servidor SMTP.
- `SMTP_PORT`: puerto SMTP.
- `SMTP_SECURE`: `true` o `false`.
- `SMTP_USER`: usuario SMTP.
- `SMTP_PASS`: contraseña SMTP.

## Despliegue

### Railway

1. Crear proyecto en Railway.
2. Subir este repositorio.
3. Configurar variables de entorno con los valores anteriores.
4. Railway ejecuta `npm install` y `npm start`.

### Vercel

1. Crear un nuevo proyecto en Vercel.
2. Conectar el repositorio.
3. Agregar las mismas variables de entorno.
4. Vercel usará `vercel.json` para ejecutar el servidor.

