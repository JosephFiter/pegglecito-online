# Pegglecito Online

Reimplementación web de **Peggle Nights**, hecha como proyecto personal para practicar, con la idea de agregarle multijugador online.

**No incluye ningún archivo del juego.** Para usarlo hace falta una copia legal de Peggle Nights. El usuario elige su `main.pak` (y opcionalmente los `.pak` de `levelpacks/`), y el navegador lo lee y lo extrae localmente, sin subirlo a ningún lado.

## Uso

```bash
npm install
npm run dev
```

Abrí http://localhost:5280 y elegí `main.pak` desde la carpeta del juego (en Steam: `steamapps/common/Peggle Nights/`).

## Estructura

- `src/formats/pak.ts`: lector del formato `.pak` de PopCap (XOR `0xF7` + tabla de archivos).
- `src/formats/level.ts`: parser de niveles `.dat` (pegs, ladrillos, polígonos, movimientos, emisores...).
- `src/game/game.ts`: la partida (física de la bola, choques, puntaje, turnos, balde, fever). No usa el DOM; la única entrada es el ángulo de tiro.
- `src/game/shapes.ts`: formas de colisión de pegs, ladrillos y polígonos.
- `src/game/constants.ts`: medidas del tablero, física y reglas.
- `src/game/movement.ts`: posición y ángulo de los objetos móviles en el tiempo (100 ticks/s).
- `src/game/pegs.ts`: sorteo determinista de pegs naranjas, verdes y violeta (con semilla, pensado para el online).
- `src/assets/`: carga de imágenes (máscaras alfa `X_.gif`, JPEG 2000) y caché de los `.pak` en IndexedDB.
- `src/render/gameView.ts`: dibuja la partida en canvas.

### Herramientas (Node 24+)

```bash
node tools/extract-pak.ts <archivo.pak> <carpeta-salida>   # extrae un .pak a disco
node tools/check-levels.ts <carpeta-con-.dat>...           # valida que todos los niveles parseen
node tools/simulate.ts <carpeta-con-.dat> [partidas]       # juega partidas al azar para chequear la física
```

`extracted/` y `local/` están en `.gitignore`: ahí van los archivos del juego para desarrollo, y nunca se suben.

## Créditos

La documentación del formato de niveles sale de [PeggleEdit](https://github.com/IntelOrca/PeggleEdit) de IntelOrca, que se usó solo como referencia (la implementación es propia). Para decodificar JPEG 2000 se usa [jpeg2000](https://github.com/runk/jpeg2000), basado en PDF.js.

Peggle es marca registrada de PopCap Games / Electronic Arts. Este proyecto no tiene relación con ellos y no tiene fines comerciales.
