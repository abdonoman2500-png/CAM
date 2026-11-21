import 'package:flutter/material.dart';

class CrossCallColors {
  static const darkCanvas = Color(0xFF0B0F19);
  static const darkSurface = Color(0xFF111827);
  static const lightCanvas = Color(0xFFF8FAFC);
  static const lightSurface = Color(0xFFFFFFFF);
  static const cobaltPrimary = Color(0xFF3B82F6);
  static const indigoAccent = Color(0xFF6366F1);
  static const answerGreen = Color(0xFF16A34A);
  static const declineRed = Color(0xFFDC2626);
  static const warningAmber = Color(0xFFD97706);
}

class CrossCallTheme {
  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: CrossCallColors.darkCanvas,
      colorScheme: const ColorScheme.dark(
        primary: CrossCallColors.cobaltPrimary,
        secondary: CrossCallColors.indigoAccent,
        surface: CrossCallColors.darkSurface,
        error: CrossCallColors.declineRed,
      ),
    );
  }

  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: CrossCallColors.lightCanvas,
      colorScheme: const ColorScheme.light(
        primary: CrossCallColors.cobaltPrimary,
        secondary: CrossCallColors.indigoAccent,
        surface: CrossCallColors.lightSurface,
        error: CrossCallColors.declineRed,
      ),
    );
  }
}
