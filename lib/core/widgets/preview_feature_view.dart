import 'package:flutter/material.dart';

import '../../app/theme/app_spacing.dart';
import 'layout.dart';

/// Klar gekennzeichnete Vorschau für Bereiche, die erst in einer späteren
/// Phase umgesetzt werden. Enthält bewusst keine Bedienelemente.
class PreviewFeatureView extends StatelessWidget {
  const PreviewFeatureView({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.plannedFeatures,
    this.phase = 'Phase 2',
  });

  final IconData icon;
  final String title;
  final String description;
  final List<String> plannedFeatures;
  final String phase;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PageBody(
      children: [
        const SizedBox(height: AppSpacing.lg),
        Center(
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, shape: BoxShape.circle),
            child: Icon(icon, size: 48, color: theme.colorScheme.onPrimaryContainer),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Center(
          child: Chip(
            avatar: const Icon(Icons.schedule, size: 18),
            label: Text('In Vorbereitung · $phase'),
            backgroundColor: theme.colorScheme.tertiaryContainer,
            labelStyle: TextStyle(color: theme.colorScheme.onTertiaryContainer, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(title, style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: AppSpacing.xs),
        Text(
          description,
          style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppSpacing.lg),
        SectionCard(
          title: 'Geplant',
          icon: Icons.checklist,
          child: Column(
            children: [
              for (final feature in plannedFeatures)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.circle_outlined, size: 16, color: theme.colorScheme.primary),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(child: Text(feature, style: theme.textTheme.bodyMedium)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
