import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_spacing.dart';

/// Material-3-Theme der App (hell und dunkel).
abstract final class AppTheme {
  static ThemeData light() => _build(_lightScheme);

  static ThemeData dark() => _build(_darkScheme);

  static const _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: AppColors.forest,
    onPrimary: AppColors.beige,
    primaryContainer: Color(0xFFC9DCC0),
    onPrimaryContainer: AppColors.forestDeep,
    secondary: AppColors.bark,
    onSecondary: Colors.white,
    secondaryContainer: AppColors.sandLight,
    onSecondaryContainer: Color(0xFF3B2A16),
    tertiary: AppColors.signalOrange,
    onTertiary: Colors.white,
    tertiaryContainer: Color(0xFFFFDCC2),
    onTertiaryContainer: Color(0xFF4A2300),
    error: AppColors.danger,
    onError: Colors.white,
    errorContainer: Color(0xFFF9DEDC),
    onErrorContainer: Color(0xFF410E0B),
    surface: AppColors.beige,
    onSurface: AppColors.charcoal,
    onSurfaceVariant: AppColors.slate,
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: Color(0xFFF1EBDD),
    surfaceContainer: Color(0xFFEBE4D3),
    surfaceContainerHigh: Color(0xFFE4DCC9),
    surfaceContainerHighest: Color(0xFFDDD4BF),
    outline: Color(0xFF8C8778),
    outlineVariant: Color(0xFFCFC7B4),
    inverseSurface: AppColors.anthracite,
    onInverseSurface: AppColors.beige,
    inversePrimary: AppColors.mossLight,
    shadow: Colors.black,
    scrim: Colors.black,
  );

  static const _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: AppColors.mossLight,
    onPrimary: AppColors.forestDeep,
    primaryContainer: AppColors.forestMid,
    onPrimaryContainer: Color(0xFFDCEBD3),
    secondary: AppColors.sand,
    onSecondary: Color(0xFF3B2A16),
    secondaryContainer: Color(0xFF5A452C),
    onSecondaryContainer: AppColors.sandLight,
    tertiary: Color(0xFFFFB77C),
    onTertiary: Color(0xFF4A2300),
    tertiaryContainer: Color(0xFF8A4A10),
    onTertiaryContainer: Color(0xFFFFDCC2),
    error: AppColors.dangerLight,
    onError: Color(0xFF601410),
    errorContainer: Color(0xFF8C1D18),
    onErrorContainer: Color(0xFFF9DEDC),
    surface: Color(0xFF121614),
    onSurface: Color(0xFFE6E2D8),
    onSurfaceVariant: Color(0xFFBDC2B8),
    surfaceContainerLowest: Color(0xFF0C0F0D),
    surfaceContainerLow: Color(0xFF1A1E1B),
    surfaceContainer: Color(0xFF1E2320),
    surfaceContainerHigh: Color(0xFF282D2A),
    surfaceContainerHighest: Color(0xFF333835),
    outline: Color(0xFF8A9188),
    outlineVariant: Color(0xFF424842),
    inverseSurface: Color(0xFFE6E2D8),
    onInverseSurface: AppColors.anthracite,
    inversePrimary: AppColors.forest,
    shadow: Colors.black,
    scrim: Colors.black,
  );

  static ThemeData _build(ColorScheme scheme) {
    final base = ThemeData(useMaterial3: true, colorScheme: scheme);
    final text = _textTheme(base.textTheme, scheme);
    final roundedMd = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
    );

    return base.copyWith(
      textTheme: text,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainerLowest,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: roundedMd.copyWith(side: BorderSide(color: scheme.outlineVariant)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: roundedMd,
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: roundedMd,
          side: BorderSide(color: scheme.outline),
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(textStyle: text.labelLarge),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLowest,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
          borderSide: BorderSide(color: scheme.error),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        indicatorColor: scheme.primaryContainer,
        surfaceTintColor: Colors.transparent,
        height: 68,
        labelTextStyle: WidgetStatePropertyAll(text.labelMedium),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: AppSpacing.md),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
    );
  }

  static TextTheme _textTheme(TextTheme base, ColorScheme scheme) {
    return base
        .copyWith(
          displaySmall: base.displaySmall?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
          headlineMedium: base.headlineMedium?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: -0.25,
          ),
          headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          labelLarge: base.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 0.3,
          ),
          bodyLarge: base.bodyLarge?.copyWith(height: 1.45),
          bodyMedium: base.bodyMedium?.copyWith(height: 1.45),
        )
        .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface);
  }
}
