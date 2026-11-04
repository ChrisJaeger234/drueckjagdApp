import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../domain/hunting_group.dart';
import 'groups_providers.dart';
import 'widgets/role_badge.dart';

/// Tab „Gruppe“: Übersicht aller eigenen Gruppen.
class GroupsScreen extends ConsumerWidget {
  const GroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gruppen')),
      body: AsyncValueView<List<MyGroup>>(
        value: ref.watch(myGroupsProvider),
        onRetry: () => ref.invalidate(myGroupsProvider),
        data: (groups) => RefreshIndicator(
          onRefresh: () => ref.refresh(myGroupsProvider.future),
          child: PageBody(
            children: [
              const _GroupActions(),
              if (groups.isEmpty)
                const EmptyState(
                  icon: Icons.groups_outlined,
                  title: 'Noch keine Gruppe',
                  message: 'Erstelle eine Jagdgruppe für deinen Freundeskreis oder tritt mit einem Einladungscode bei.',
                )
              else ...[
                SectionHeader('Meine Gruppen (${groups.length})'),
                for (final g in groups) ...[GroupCard(group: g), const SizedBox(height: AppSpacing.sm)],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupActions extends StatelessWidget {
  const _GroupActions();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: AppButton(label: 'Erstellen', icon: Icons.add, onPressed: () => context.push(Routes.groupCreate)),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: AppButton.secondary(
            label: 'Beitreten',
            icon: Icons.vpn_key_outlined,
            onPressed: () => context.push(Routes.groupJoin),
          ),
        ),
      ],
    );
  }
}

/// Karte einer Gruppe in Listen.
class GroupCard extends StatelessWidget {
  const GroupCard({super.key, required this.group});

  final MyGroup group;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(Routes.group(group.group.id)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
                child: Icon(Icons.forest_outlined, color: theme.colorScheme.onPrimaryContainer),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(group.group.name, style: theme.textTheme.titleMedium),
                    if (group.group.description.isNotEmpty)
                      Text(
                        group.group.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    const SizedBox(height: AppSpacing.xs),
                    RoleBadge(group.role),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
