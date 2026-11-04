import 'package:flutter/material.dart';

enum AppButtonVariant { primary, secondary, text, danger }

/// Einheitlicher Button mit Ladezustand. Während [isLoading] ist er gesperrt.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
    this.variant = AppButtonVariant.primary,
  });

  const AppButton.secondary({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
  }) : variant = AppButtonVariant.secondary;

  const AppButton.text({super.key, required this.label, required this.onPressed, this.icon, this.isLoading = false})
    : variant = AppButtonVariant.text;

  const AppButton.danger({super.key, required this.label, required this.onPressed, this.icon, this.isLoading = false})
    : variant = AppButtonVariant.danger;

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isLoading;
  final AppButtonVariant variant;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final callback = isLoading ? null : onPressed;
    final child = isLoading
        ? SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: variant == AppButtonVariant.primary ? scheme.onPrimary : scheme.primary,
            ),
          )
        : Text(label);

    Widget withIcon(Widget Function({required Widget icon, required Widget label}) builder, Widget plain) =>
        icon != null && !isLoading ? builder(icon: Icon(icon), label: Text(label)) : plain;

    switch (variant) {
      case AppButtonVariant.primary:
        return withIcon(
          ({required icon, required label}) => FilledButton.icon(onPressed: callback, icon: icon, label: label),
          FilledButton(onPressed: callback, child: child),
        );
      case AppButtonVariant.danger:
        final style = FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError);
        return withIcon(
          ({required icon, required label}) =>
              FilledButton.icon(onPressed: callback, icon: icon, label: label, style: style),
          FilledButton(onPressed: callback, style: style, child: child),
        );
      case AppButtonVariant.secondary:
        return withIcon(
          ({required icon, required label}) => OutlinedButton.icon(onPressed: callback, icon: icon, label: label),
          OutlinedButton(onPressed: callback, child: child),
        );
      case AppButtonVariant.text:
        return withIcon(
          ({required icon, required label}) => TextButton.icon(onPressed: callback, icon: icon, label: label),
          TextButton(onPressed: callback, child: child),
        );
    }
  }
}
