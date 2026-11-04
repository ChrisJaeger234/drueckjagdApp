import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../constants/app_constants.dart';

/// Vorläufiges Logo: Bildmarke (stilisierte Fichte im Kreis) + Schriftzug.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 96, this.showWordmark = true, this.onDark = false});

  final double size;
  final bool showWordmark;

  /// Auf dunklem (grünem) Hintergrund helle Farben verwenden.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final markColor = onDark ? AppColors.sand : theme.colorScheme.primary;
    final textColor = onDark ? AppColors.beige : theme.colorScheme.onSurface;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          label: '${AppConstants.appName} Logo',
          child: SizedBox.square(
            dimension: size,
            child: CustomPaint(painter: _MarkPainter(markColor)),
          ),
        ),
        if (showWordmark) ...[
          SizedBox(height: size * 0.22),
          Text(
            AppConstants.appName.toUpperCase(),
            style: theme.textTheme.headlineMedium?.copyWith(
              color: textColor,
              letterSpacing: 6,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            AppConstants.appTagline,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: textColor.withValues(alpha: 0.75),
              letterSpacing: 1.5,
            ),
          ),
        ],
      ],
    );
  }
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final ring = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.05;
    canvas.drawCircle(Offset(w / 2, w / 2), w / 2 - ring.strokeWidth, ring);

    // Fichte aus drei Etagen
    final fill = Paint()..color = color;
    final cx = w / 2;
    for (var i = 0; i < 3; i++) {
      final top = w * (0.2 + i * 0.14);
      final half = w * (0.12 + i * 0.06);
      final bottom = top + w * 0.2;
      final path = Path()
        ..moveTo(cx, top)
        ..lineTo(cx + half, bottom)
        ..lineTo(cx - half, bottom)
        ..close();
      canvas.drawPath(path, fill);
    }
    canvas.drawRect(Rect.fromLTWH(cx - w * 0.035, w * 0.68, w * 0.07, w * 0.1), fill);

    // Horizontlinie
    final horizon = Paint()
      ..color = color
      ..strokeWidth = w * 0.03
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(w * 0.24, w * 0.78), Offset(w * 0.76, w * 0.78), horizon);
  }

  @override
  bool shouldRepaint(_MarkPainter oldDelegate) => oldDelegate.color != color;
}
