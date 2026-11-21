# Mission control

Un mod para Claude Code: un panel junto al chat que se abre solo cuando un agente lanza subagentes y los muestra como diagrama, con el agente principal arriba y una tarjeta por subagente debajo.

Cada tarjeta muestra:

- nombre corto y tarea resumida en una línea
- punto de estado: en curso, terminado o error
- progreso por tareas: un punto por tarea (hasta 24) o una barra, con `k/N` y porcentaje
- lo que hace ahora (la última herramienta que pidió)
- el modelo que usa y su consumo (contexto y tokens de salida)

Cada subagente se une al principal con una línea discontinua de un color propio, que también tiñe su progreso. El agente principal muestra su modelo, su consumo y una barra global con una franja por subagente, proporcional a sus tareas.

Los nodos terminados se quedan visibles hasta que el siguiente encargo lanza subagentes nuevos. El diagrama lleva fondo oscuro propio, así que se lee con cualquier tema.

## Consumo de tokens

El panel se dibuja con datos que Claude Code ya tiene; no hace llamadas al modelo. Lo único que añade es una línea de unos 40 tokens al encargo de cada subagente, para que marque su avance con `[k/N]` en sus mensajes. Un subagente que no lo hace se muestra con barra indeterminada.

## Instalación

En el prompt de una sesión de terminal:

```
/plugin install mission-control --marketplace AlonsoVine/claude-mod-mission-control
```

Responde `y` para añadir el marketplace y elige el ámbito (`user` para tenerlo en todos tus proyectos).

Desde una shell:

```
claude plugin install mission-control --marketplace AlonsoVine/claude-mod-mission-control
```

## Uso

No hay que hacer nada: el panel se abre al lanzarse el primer subagente. Para abrirlo a mano, `/mission-control`.
