import com.sun.media.sound.EmergencySoundbank;
import com.sun.media.sound.SF2Soundbank;
import java.io.File;
import java.lang.reflect.Field;
import java.util.Random;

/**
 * Saves the sound set Gervill generates when no soundbank is installed, the one MARS and RARS play
 * their MIDI services on under JDK 21, as an SF2 file, and prints the JDK that generated it. Run by
 * `generate.mjs`, which passes the export and the opening this needs.
 *
 * Most of the generator's random numbers come from fixed seeds, but the phases of its FFT-built
 * samples come from `Math.random()` (`randomPhase(double[])`), so a JVM generates a different file
 * every time it starts: the same spectra, so the same instruments, with different phases. Seeding
 * the generator behind `Math.random()` before generating makes the file the same on every run, and
 * no less what MARS plays, whose own phases change with every start.
 */
public class SaveEmergencySoundbank {
    private static final long SEED = 0;

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: SaveEmergencySoundbank <file.sf2>");
            System.exit(2);
        }
        Field generator = Class.forName("java.lang.Math$RandomNumberGeneratorHolder")
                .getDeclaredField("randomNumberGenerator");
        generator.setAccessible(true);
        ((Random) generator.get(null)).setSeed(SEED);
        SF2Soundbank soundbank = EmergencySoundbank.createSoundbank();
        soundbank.save(new File(args[0]));
        System.out.println(System.getProperty("java.vendor.version") + " (" + Runtime.version() + ")");
    }
}
