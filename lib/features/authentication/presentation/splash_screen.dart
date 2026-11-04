import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/services/supabase_service.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_logo.dart';
import '../../../core/errors/error_mapper.dart';

/// Startbildschirm: zeigt die Marke, initialisiert Supabase und stellt die
/// Sitzung wieder her. Die Weiterleitung übernimmt der Router anhand des
/// Authentifizierungsstatus.
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final startup = ref.watch(appStartupProvider);

    return Scaffold(
      backgroundColor: AppColors.forestDeep,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppColors.forest, AppColors.forestDeep, AppColors.charcoal],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              children: [
                const Spacer(flex: 3),
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutCubic,
                  builder: (context, t, child) => Opacity(
                    opacity: t,
                    child: Transform.translate(offset: Offset(0, 16 * (1 - t)), child: child),
                  ),
                  child: const AppLogo(size: 112, onDark: true),
                ),
                const Spacer(flex: 2),
                if (startup.hasError)
                  _StartupProblem(error: startup.error!, onRetry: () => ref.invalidate(appStartupProvider))
                else
                  const SizedBox.square(
                    dimension: 28,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.sand),
                  ),
                const Spacer(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StartupProblem extends StatelessWidget {
  const _StartupProblem({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isConfig = error is ConfigurationException;
    final problems = isConfig ? (error as ConfigurationException).problems : const <String>[];

    return Card(
      color: theme.colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  isConfig ? Icons.settings_suggest_outlined : Icons.cloud_off_outlined,
                  color: theme.colorScheme.tertiary,
                ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    isConfig ? 'Einrichtung erforderlich' : 'Start fehlgeschlagen',
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(ErrorMapper.map(error).message),
            for (final p in problems)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text('• $p', style: theme.textTheme.bodySmall),
              ),
            if (isConfig) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Starte die App mit „flutter run --dart-define-from-file=.env“. '
                'Details stehen in docs/SETUP.md.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ] else ...[
              const SizedBox(height: AppSpacing.md),
              AppButton.secondary(label: 'Erneut versuchen', icon: Icons.refresh, onPressed: onRetry),
            ],
          ],
        ),
      ),
    );
  }
}
