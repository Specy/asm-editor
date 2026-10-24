# soundbank-emg.sf2

The sound bank every **Note** and MIDI File plays on ([ADR 0058](../../../../../../../../docs/adr/0058-notes-play-on-the-bank-mars-plays-on-jdk-21.md)): the Emergency GM sound set, 128 General MIDI instruments and a drum kit, that Java's Gervill synthesizer generates when no soundbank is installed, which is what MARS and RARS play their MIDI services on under JDK 21.

## Where it comes from

- **Generator:** `com.sun.media.sound.EmergencySoundbank.createSoundbank()`, in OpenJDK's `src/java.desktop/share/classes/com/sun/media/sound/EmergencySoundbank.java`, Copyright (c) 2007, 2018, Oracle and/or its affiliates.
- **Licence of the generator:** GNU General Public License version 2 only, with the Classpath Exception.
- **JDK that generated this file:** Eclipse Temurin 21.0.12.1+1 (OpenJDK 21.0.12.1+1-LTS), Linux x86_64.
- **One change to a plain run:** the generator gives the phases of its FFT-built samples from `Math.random()`, unseeded, so every JVM start generates a different file with the same spectra. `SaveEmergencySoundbank.java` seeds the generator behind `Math.random()` with 0 first, so the file is the same on every run. MARS's own bank differs in the same phases each time it starts.

This file is the generator's output, not its code. It is shipped as separate data, fetched and loaded at runtime, and is not compiled into the editor, whose code is under the AGPLv3; neither licence reaches the other.

## Regenerating it

From `packages/asm-editor`, with the JDK that the repository's `mise.toml` pins installed (`mise install`):

```sh
node scripts/audio-bank/generate.mjs          # writes soundbank-emg.sf2
node scripts/audio-bank/generate.mjs --check  # fails when a fresh generation differs from it
```

The script runs [`SaveEmergencySoundbank.java`](../../../../../../scripts/audio-bank/SaveEmergencySoundbank.java) through `mise exec -- java` and prints the JDK it ran on; after a JDK change, update the version above to match.
