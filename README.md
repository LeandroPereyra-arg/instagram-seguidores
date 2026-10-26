# Seguidores de Instagram (extensión de Chrome)

Muestra:
- **No te siguen de vuelta**: cuentas que tú sigues y que no te siguen.
- **Te dejaron de seguir**: cuentas que te dejaron de seguir desde el escaneo anterior.
- **Nuevos seguidores**: cuentas que empezaron a seguirte desde el escaneo anterior.
- **Tú no los sigues**: te siguen, pero tú no los sigues.
- **Historial**: todos los cambios detectados, con fecha.

## Instalación
1. Abre `chrome://extensions` (también funciona en Edge con `edge://extensions` y en Brave).
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta del repositorio.
4. Fija el icono de la extensión en la barra para tenerlo a mano.

## Uso
1. Inicia sesión en instagram.com en ese navegador.
2. Haz clic en el icono de la extensión y luego en **Escanear ahora**.
3. El primer escaneo guarda una "foto" de tus seguidores. A partir del segundo verás quién te dejó de seguir y quién empezó a seguirte.

## Importante
- Usa la API interna de la web de Instagram con tu propia sesión. Si Instagram la cambia, la extensión puede dejar de funcionar.
- Para no arriesgar bloqueos temporales, hace pausas entre peticiones; no escanees más de una o dos veces al día.
- Si alguien aparece en "Te dejaron de seguir", también puede ser que desactivó o borró la cuenta, o que te bloqueó.
- Todos los datos quedan en tu navegador (`chrome.storage.local`); no se envían a ningún servidor.
