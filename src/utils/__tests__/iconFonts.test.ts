const mockFontMap = {
    MaterialIcons: 1,
    Ionicons: 2,
    FontAwesome: 3,
    FontAwesome5_Brands: 4,
    FontAwesome5_Regular: 5,
    FontAwesome5_Solid: 6,
};

jest.mock('expo-font', () => ({
    isLoaded: jest.fn(),
    loadAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
    MaterialIcons: { font: { MaterialIcons: mockFontMap.MaterialIcons } },
    Ionicons: { font: { Ionicons: mockFontMap.Ionicons } },
    FontAwesome: { font: { FontAwesome: mockFontMap.FontAwesome } },
    FontAwesome5: {
        font: {
            FontAwesome5_Brands: mockFontMap.FontAwesome5_Brands,
            FontAwesome5_Regular: mockFontMap.FontAwesome5_Regular,
            FontAwesome5_Solid: mockFontMap.FontAwesome5_Solid,
        },
    },
}));

describe('iconFonts', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('loads all vector icon font families before reporting ready', async () => {
        const Font = require('expo-font');
        Font.loadAsync.mockResolvedValue(undefined);
        Font.isLoaded.mockReturnValue(true);

        const { getRequiredIconFontFamilies, loadRequiredIconFonts } = require('../iconFonts');

        expect(getRequiredIconFontFamilies()).toEqual(Object.keys(mockFontMap));

        await loadRequiredIconFonts();

        expect(Font.loadAsync).toHaveBeenCalledWith(mockFontMap);
        expect(Font.isLoaded).toHaveBeenCalledTimes(Object.keys(mockFontMap).length);
    });

    it('rejects when a font family is still missing after loadAsync resolves', async () => {
        const Font = require('expo-font');
        Font.loadAsync.mockResolvedValue(undefined);
        Font.isLoaded.mockImplementation((fontFamily: string) => fontFamily !== 'Ionicons');

        const { loadRequiredIconFonts } = require('../iconFonts');

        await expect(loadRequiredIconFonts()).rejects.toThrow('Icon fonts failed to load: Ionicons');
    });
});
