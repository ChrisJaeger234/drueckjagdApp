import 'package:flutter/material.dart';

import '../../app/theme/app_spacing.dart';

/// Begrenzt die Inhaltsbreite auf Tablets und zentriert den Inhalt.
class ResponsiveCenter extends StatelessWidget {
  const ResponsiveCenter({super.key, required this.child, this.maxWidth = AppSpacing.maxContentWidth});

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}

/// Scrollbarer, responsiver Seiteninhalt mit Standardabständen.
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children, this.padding});

  final List<Widget> children;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: padding ?? const EdgeInsets.all(AppSpacing.md),
        child: ResponsiveCenter(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
      ),
    );
  }
}

/// Karte mit Titelzeile und Inhalt.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child, this.title, this.trailing, this.icon});

  final String? title;
  final Widget? trailing;
  final IconData? icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 20, color: theme.colorScheme.primary),
                    const SizedBox(width: AppSpacing.xs),
                  ],
                  Expanded(child: Text(title!, style: theme.textTheme.titleMedium)),
                  ?trailing,
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

/// Überschrift für einen Abschnitt in Listen.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.xxs, AppSpacing.lg, AppSpacing.xxs, AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text.toUpperCase(),
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
