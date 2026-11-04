import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../groups/domain/hunting_group.dart';
import '../../groups/presentation/groups_providers.dart';
import '../../groups/presentation/groups_screen.dart';
import '../../hunting_grounds/domain/revier.dart';
import '../../hunting_grounds/presentation/reviere_providers.dart';
import '../../hunting_grounds/presentation/widgets/revier_tile.dart';
import '../../profile/presentation/profile_providers.dart';

/// Tab „Übersicht“: Begrüßung, Kennzahlen, Gruppen und Reviere.
class OverviewScreen extends ConsumerWidget {
  const OverviewScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref
      ..invalidate(currentProfileProvider)
      ..invalidate(myGroupsProvider)
      ..invalidate(allReviereProvider);
    await ref.read(myGroupsProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(currentProfileProvider).value;
    final groups = ref.watch(myGroupsProvider);
    final reviere = ref.watch(allReviereProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Übersicht')),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: PageBody(
          children: [
            _WelcomeBanner(
              name: profile?.displayName.trim().isNotEmpty ?? false ? profile!.displayName : null,
              groupCount: groups.value?.length,
              revierCount: reviere.value?.length,
            ),
            if (profile != null && !profile.isComplete) ...[
              const SizedBox(height: AppSpacing.md),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.badge_outlined),
                  title: const Text('Profil vervollständigen'),
                  subtitle: const Text('Lege deinen Anzeige- und Benutzernamen fest.'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(Routes.profileEdit),
                ),
              ),
            ],
            const SectionHeader('Meine Gruppen'),
            AsyncValueView<List<MyGroup>>(
              value: groups,
              onRetry: () => ref.invalidate(myGroupsProvider),
              data: (list) => list.isEmpty
                  ? Card(
                      child: EmptyState(
                        icon: Icons.groups_outlined,
                        title: 'Starte mit deiner Gruppe',
                        message: 'Erstelle eine Jagdgruppe oder tritt mit einem Einladungscode bei.',
                        action: Column(
                          children: [
                            AppButton(
                              label: 'Gruppe erstellen',
                              icon: Icons.add,
                              onPressed: () => context.push(Routes.groupCreate),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            AppButton.secondary(
                              label: 'Mit Code beitreten',
                              icon: Icons.vpn_key_outlined,
                              onPressed: () => context.push(Routes.groupJoin),
                            ),
                          ],
                        ),
                      ),
                    )
                  : Column(
                      children: [
                        for (final g in list) ...[GroupCard(group: g), const SizedBox(height: AppSpacing.sm)],
                      ],
                    ),
            ),
            const SectionHeader('Meine Reviere'),
            AsyncValueView<List<Revier>>(
              value: reviere,
              onRetry: () => ref.invalidate(allReviereProvider),
              data: (list) => list.isEmpty
                  ? Text(
                      'Noch keine Reviere. Owner und Admins legen Reviere in der Gruppenansicht an.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    )
                  : Card(
                      clipBehavior: Clip.antiAlias,
                      child: Column(
                        children: [
                          for (final (i, r) in list.indexed) ...[if (i > 0) const Divider(), RevierTile(revier: r)],
                        ],
                      ),
                    ),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _WelcomeBanner extends StatelessWidget {
  const _WelcomeBanner({required this.name, required this.groupCount, required this.revierCount});

  final String? name;
  final int? groupCount;
  final int? revierCount;

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 11) return 'Guten Morgen';
    if (hour < 18) return 'Waidmannsheil';
    return 'Guten Abend';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.forestMid, AppColors.forestDeep],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name == null ? '$_greeting!' : '$_greeting, $name!',
            style: theme.textTheme.headlineSmall?.copyWith(color: AppColors.beige),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              _Stat(label: 'Gruppen', value: groupCount),
              const SizedBox(width: AppSpacing.lg),
              _Stat(label: 'Reviere', value: revierCount),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final int? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value?.toString() ?? '–', style: theme.textTheme.headlineMedium?.copyWith(color: AppColors.sand)),
        Text(label, style: theme.textTheme.bodySmall?.copyWith(color: AppColors.sandLight)),
      ],
    );
  }
}
