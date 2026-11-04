import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../../hunts/domain/hunt.dart';
import '../../hunts/presentation/hunts_providers.dart';
import '../../hunts/presentation/widgets/hunt_tile.dart';
import '../../hunting_grounds/domain/revier.dart';
import '../../hunting_grounds/presentation/reviere_providers.dart';
import '../../hunting_grounds/presentation/widgets/revier_tile.dart';
import '../domain/group_invite.dart';
import '../domain/group_role.dart';
import '../domain/hunting_group.dart';
import 'groups_providers.dart';
import 'widgets/invite_sheet.dart';
import 'widgets/role_badge.dart';

enum _GroupMenuAction { edit, leave, delete }

class GroupDetailScreen extends ConsumerWidget {
  const GroupDetailScreen({super.key, required this.groupId});

  final String groupId;

  Future<void> _onMenu(BuildContext context, WidgetRef ref, MyGroup group, _GroupMenuAction action) async {
    final repo = ref.read(groupsRepositoryProvider);
    switch (action) {
      case _GroupMenuAction.edit:
        await context.push(Routes.groupEdit(groupId));
      case _GroupMenuAction.leave:
        final ok = await showConfirmDialog(
          context,
          title: 'Gruppe verlassen?',
          message:
              'Du verlierst den Zugriff auf „${group.group.name}“ und ihre Reviere. '
              'Für einen erneuten Beitritt brauchst du einen neuen Einladungscode.',
          confirmLabel: 'Verlassen',
          destructive: true,
        );
        if (!ok || !context.mounted) return;
        try {
          await repo.leaveGroup(groupId);
          invalidateGroupData(ref);
          ref.invalidate(allReviereProvider);
          if (!context.mounted) return;
          showAppSnackBar(context, 'Du hast die Gruppe verlassen.');
          context.go(Routes.groups);
        } catch (e) {
          if (context.mounted) showErrorSnackBar(context, e);
        }
      case _GroupMenuAction.delete:
        final ok = await showConfirmDialog(
          context,
          title: 'Gruppe endgültig löschen?',
          message: 'Die Gruppe, alle Mitgliedschaften, Einladungen und Reviere werden unwiderruflich gelöscht.',
          confirmLabel: 'Löschen',
          destructive: true,
        );
        if (!ok || !context.mounted) return;
        try {
          await repo.deleteGroup(groupId);
          invalidateGroupData(ref);
          ref.invalidate(allReviereProvider);
          if (!context.mounted) return;
          showAppSnackBar(context, 'Gruppe wurde gelöscht.');
          context.go(Routes.groups);
        } catch (e) {
          if (context.mounted) showErrorSnackBar(context, e);
        }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupValue = ref.watch(myGroupProvider(groupId));

    return Scaffold(
      appBar: AppBar(
        title: Text(groupValue.value?.group.name ?? 'Gruppe'),
        actions: [
          if (groupValue.value case final group?)
            PopupMenuButton<_GroupMenuAction>(
              tooltip: 'Weitere Aktionen',
              onSelected: (a) => _onMenu(context, ref, group, a),
              itemBuilder: (_) => [
                if (group.permissions.canEditGroup)
                  const PopupMenuItem(value: _GroupMenuAction.edit, child: Text('Gruppe bearbeiten')),
                const PopupMenuItem(value: _GroupMenuAction.leave, child: Text('Gruppe verlassen')),
                if (group.permissions.canDeleteGroup)
                  const PopupMenuItem(value: _GroupMenuAction.delete, child: Text('Gruppe löschen')),
              ],
            ),
        ],
      ),
      body: AsyncValueView<MyGroup>(
        value: groupValue,
        onRetry: () => invalidateGroupData(ref, groupId: groupId),
        data: (group) => RefreshIndicator(
          onRefresh: () async {
            invalidateGroupData(ref, groupId: groupId);
            ref
              ..invalidate(groupReviereProvider(groupId))
              ..invalidate(groupHuntsProvider(groupId));
            await ref.read(myGroupProvider(groupId).future);
          },
          child: PageBody(
            children: [
              _GroupHeader(group: group),
              _HuntsSection(group: group),
              _ReviereSection(group: group),
              _MembersSection(group: group),
              if (group.permissions.canInvite) _InvitesSection(group: group),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group});

  final MyGroup group;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(group.group.name, style: theme.textTheme.headlineSmall)),
              RoleBadge(group.role),
            ],
          ),
          if (group.group.description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(group.group.description, style: theme.textTheme.bodyMedium),
          ],
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Gegründet am ${Formatters.date(group.group.createdAt)} · Deine Rolle: ${group.role.description}',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _HuntsSection extends ConsumerWidget {
  const _HuntsSection({required this.group});

  final MyGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupId = group.group.id;
    final hunts = ref.watch(groupHuntsProvider(groupId));
    final canCreate = group.permissions.canCreateRevier;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Jagden',
          trailing: canCreate
              ? TextButton.icon(
                  onPressed: () => context.push(Routes.huntCreate(groupId)),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Jagd'),
                )
              : null,
        ),
        AsyncValueView<List<Hunt>>(
          value: hunts,
          onRetry: () => ref.invalidate(groupHuntsProvider(groupId)),
          data: (list) => list.isEmpty
              ? Card(
                  child: EmptyState(
                    icon: Icons.flag_outlined,
                    title: 'Noch keine Jagd',
                    message: canCreate
                        ? 'Plane die erste Jagd: Termin, Treffpunkt, Freigabe und Stände.'
                        : 'Owner und Admins legen Jagden an. Du kannst dich dann selbst eintragen.',
                  ),
                )
              : Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      for (final (i, h) in sortHuntsForDisplay(list).indexed) ...[
                        if (i > 0) const Divider(),
                        HuntTile(hunt: h, showGroup: false),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _ReviereSection extends ConsumerWidget {
  const _ReviereSection({required this.group});

  final MyGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupId = group.group.id;
    final reviere = ref.watch(groupReviereProvider(groupId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Reviere',
          trailing: group.permissions.canCreateRevier
              ? TextButton.icon(
                  onPressed: () => context.push(Routes.revierCreate(groupId)),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Neu'),
                )
              : null,
        ),
        AsyncValueView<List<Revier>>(
          value: reviere,
          onRetry: () => ref.invalidate(groupReviereProvider(groupId)),
          data: (list) => list.isEmpty
              ? Card(
                  child: EmptyState(
                    icon: Icons.map_outlined,
                    title: 'Noch kein Revier',
                    message: group.permissions.canCreateRevier
                        ? 'Lege das erste Revier dieser Gruppe an.'
                        : 'Ein Owner oder Admin kann Reviere anlegen.',
                  ),
                )
              : Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      for (final (i, r) in list.indexed) ...[
                        if (i > 0) const Divider(),
                        RevierTile(revier: r, showGroup: false),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

enum _MemberAction { makeOwner, makeAdmin, makeMember, remove }

class _MembersSection extends ConsumerWidget {
  const _MembersSection({required this.group});

  final MyGroup group;

  Future<void> _onAction(BuildContext context, WidgetRef ref, GroupMember member, _MemberAction action) async {
    final repo = ref.read(groupsRepositoryProvider);
    final groupId = group.group.id;
    try {
      switch (action) {
        case _MemberAction.makeOwner:
          final ok = await showConfirmDialog(
            context,
            title: '${member.label} zum Owner machen?',
            message: 'Owner haben alle Rechte, inklusive Löschen der Gruppe und Rollenvergabe.',
            confirmLabel: 'Zum Owner machen',
          );
          if (!ok) return;
          await repo.setMemberRole(groupId: groupId, userId: member.userId, role: GroupRole.owner);
        case _MemberAction.makeAdmin:
          await repo.setMemberRole(groupId: groupId, userId: member.userId, role: GroupRole.admin);
        case _MemberAction.makeMember:
          await repo.setMemberRole(groupId: groupId, userId: member.userId, role: GroupRole.member);
        case _MemberAction.remove:
          if (!context.mounted) return;
          final ok = await showConfirmDialog(
            context,
            title: '${member.label} entfernen?',
            message: 'Das Mitglied verliert den Zugriff auf die Gruppe und ihre Reviere.',
            confirmLabel: 'Entfernen',
            destructive: true,
          );
          if (!ok) return;
          await repo.removeMember(groupId: groupId, userId: member.userId);
      }
      invalidateGroupData(ref, groupId: groupId);
      if (context.mounted) showAppSnackBar(context, 'Mitglied wurde aktualisiert.');
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final members = ref.watch(groupMembersProvider(group.group.id));
    final myId = ref.watch(currentUserIdProvider);
    final perms = group.permissions;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader('Mitglieder${members.value == null ? '' : ' (${members.value!.length})'}'),
        AsyncValueView<List<GroupMember>>(
          value: members,
          onRetry: () => ref.invalidate(groupMembersProvider(group.group.id)),
          data: (list) => Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (i, m) in list.indexed) ...[
                  if (i > 0) const Divider(),
                  ListTile(
                    leading: UserAvatar(name: m.label),
                    title: Text(m.userId == myId ? '${m.label} (du)' : m.label),
                    subtitle: Text(
                      [
                        if (m.profile?.username != null) '@${m.profile!.username}',
                        'seit ${Formatters.date(m.joinedAt)}',
                      ].join(' · '),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        RoleBadge(m.role),
                        if (_actionsFor(m, myId, perms).isNotEmpty)
                          PopupMenuButton<_MemberAction>(
                            tooltip: 'Mitglied verwalten',
                            onSelected: (a) => _onAction(context, ref, m, a),
                            itemBuilder: (_) => [
                              for (final a in _actionsFor(m, myId, perms))
                                PopupMenuItem(value: a, child: Text(_label(a))),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  static List<_MemberAction> _actionsFor(GroupMember m, String myId, GroupPermissions perms) {
    final isSelf = m.userId == myId;
    return [
      if (perms.canAssignRoles && !isSelf) ...[
        if (m.role != GroupRole.owner) _MemberAction.makeOwner,
        if (m.role != GroupRole.admin) _MemberAction.makeAdmin,
        if (m.role != GroupRole.member) _MemberAction.makeMember,
      ],
      if (perms.canRemove(m.role, isSelf: isSelf)) _MemberAction.remove,
    ];
  }

  static String _label(_MemberAction a) => switch (a) {
    _MemberAction.makeOwner => 'Zum Owner ernennen',
    _MemberAction.makeAdmin => 'Zum Admin ernennen',
    _MemberAction.makeMember => 'Zum Mitglied herabstufen',
    _MemberAction.remove => 'Aus Gruppe entfernen',
  };
}

class _InvitesSection extends ConsumerWidget {
  const _InvitesSection({required this.group});

  final MyGroup group;

  Future<void> _revoke(BuildContext context, WidgetRef ref, GroupInvite invite) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Einladung widerrufen?',
      message: 'Der Code kann danach nicht mehr verwendet werden.',
      confirmLabel: 'Widerrufen',
      destructive: true,
    );
    if (!ok) return;
    try {
      await ref.read(groupsRepositoryProvider).revokeInvite(invite.id);
      ref.invalidate(groupInvitesProvider(group.group.id));
    } catch (e) {
      if (context.mounted) showErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invites = ref.watch(groupInvitesProvider(group.group.id));
    final now = DateTime.now();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('Einladungen'),
        AppButton.secondary(
          label: 'Einladungscode erstellen',
          icon: Icons.person_add_alt,
          onPressed: () => showCreateInviteSheet(context, groupId: group.group.id),
        ),
        const SizedBox(height: AppSpacing.sm),
        AsyncValueView<List<GroupInvite>>(
          value: invites,
          onRetry: () => ref.invalidate(groupInvitesProvider(group.group.id)),
          data: (list) {
            if (list.isEmpty) {
              return Text(
                'Noch keine Einladungen erstellt.',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              );
            }
            return Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (final (i, inv) in list.indexed) ...[
                    if (i > 0) const Divider(),
                    _InviteTile(invite: inv, status: inv.statusAt(now), onRevoke: () => _revoke(context, ref, inv)),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _InviteTile extends StatelessWidget {
  const _InviteTile({required this.invite, required this.status, required this.onRevoke});

  final GroupInvite invite;
  final InviteStatus status;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = status == InviteStatus.active;
    final uses = invite.maxUses == null
        ? '${invite.useCount} Nutzungen'
        : '${invite.useCount}/${invite.maxUses} genutzt';
    final expiry = invite.expiresAt == null ? 'ohne Ablauf' : 'gültig bis ${Formatters.dateTime(invite.expiresAt!)}';
    return ListTile(
      leading: Icon(active ? Icons.key : Icons.key_off_outlined, color: active ? scheme.primary : scheme.outline),
      title: Text('Erstellt am ${Formatters.dateTime(invite.createdAt)}'),
      subtitle: Text('${status.label} · $uses · $expiry'),
      trailing: active ? IconButton(tooltip: 'Widerrufen', icon: const Icon(Icons.block), onPressed: onRevoke) : null,
    );
  }
}
