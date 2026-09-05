# Inject screens at the Emulator boundary

Callers will supply a **Screen** instance when creating an **Emulator**; its language adapter will connect the **Core** to that Screen, and the GUI will observe the same instance. Core packages may gain the graphics or memory hooks needed for this integration while remaining independent of the editor's Screen implementation, preserving their usability outside the editor. This extends the internally created peripherals of [ADR 0001](./0001-peripheral-based-emulator-io.md); the injection API is not yet implemented.
