import * as Font from 'expo-font';
import { FontAwesome, FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';

const requiredIconFonts = {
    ...MaterialIcons.font,
    ...Ionicons.font,
    ...FontAwesome.font,
    ...FontAwesome5.font,
};

let iconFontLoadPromise: Promise<void> | null = null;

export function getRequiredIconFontFamilies(fontMap = requiredIconFonts): string[] {
    return Object.keys(fontMap);
}

export function areRequiredIconFontsLoaded(): boolean {
    return getRequiredIconFontFamilies().every((fontFamily) => Font.isLoaded(fontFamily));
}

export function loadRequiredIconFonts(): Promise<void> {
    if (!iconFontLoadPromise) {
        iconFontLoadPromise = Font.loadAsync(requiredIconFonts)
            .then(() => {
                const unloadedFontFamilies = getRequiredIconFontFamilies().filter(
                    (fontFamily) => !Font.isLoaded(fontFamily)
                );

                if (unloadedFontFamilies.length > 0) {
                    throw new Error(`Icon fonts failed to load: ${unloadedFontFamilies.join(', ')}`);
                }
            })
            .catch((error) => {
                iconFontLoadPromise = null;
                throw error;
            });
    }

    return iconFontLoadPromise;
}
