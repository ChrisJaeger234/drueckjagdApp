import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/dialogs.dart';
import '../../domain/group_invite.dart';
import '../groups_providers.dart';

/// Öffnet das Formular zum Erzeugen eines Einladungscodes.
Future<void> showCreateInviteSheet(BuildContext context, {required String groupId}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _CreateInviteSheet(groupId: groupId),
  );
}

class _CreateInviteSheet extends ConsumerStatefulWidget {
  const _CreateInviteSheet({required this.groupId});

  final String groupId;

  @override
  ConsumerState<_CreateInviteSheet> createState() => _CreateInviteSheetState();
}

class _CreateInviteSheetState extends ConsumerState<_CreateInviteSheet> {
  static const _validityOptions = <int, String>{24: '24 Stunden', 168: '7 Tage', 720: '30 Tage'};
  static const _usesOptions = <int?, String>{1: 'Einmalig', 5: '5×', 20: '20×', null: 'Unbegrenzt'};

  int _validHours = 168;
  int? _maxUses = 1;
  bool _creating = false;
  CreatedInvite? _created;

  Future<void> _create() async {
    setState(() => _creating = true);
    try {
      final invite = await ref
          .read(groupsRepositoryProvider)
          .createInvite(groupId: widget.groupId, validHours: _validHours, maxUses: _maxUses);
      ref.invalidate(groupInvitesProvider(widget.groupId));
      if (mounted) setState(() => _created = invite);
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: _created!.code));
    if (mounted) showAppSnackBar(context, 'Code kopiert.');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: _created == null ? _buildForm(theme) : _buildResult(theme, _created!),
      ),
    );
  }

  Widget _buildForm(ThemeData theme) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Einladungscode erstellen', style: theme.textTheme.titleLarge),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Der Code wird nur einmal angezeigt und serverseitig ausschließlich als Hash gespeichert.',
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text('Gültigkeit', style: theme.textTheme.labelLarge),
        const SizedBox(height: AppSpacing.xs),
        SegmentedButton<int>(
          segments: [for (final e in _validityOptions.entries) ButtonSegment(value: e.key, label: Text(e.value))],
          selected: {_validHours},
          onSelectionChanged: (s) => setState(() => _validHours = s.first),
        ),
        const SizedBox(height: AppSpacing.md),
        Text('Nutzungen', style: theme.textTheme.labelLarge),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          children: [
            for (final e in _usesOptions.entries)
              ChoiceChip(
                label: Text(e.value),
                selected: _maxUses == e.key,
                onSelected: (_) => setState(() => _maxUses = e.key),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(label: 'Code erzeugen', icon: Icons.key, isLoading: _creating, onPressed: _create),
      ],
    );
  }

  Widget _buildResult(ThemeData theme, CreatedInvite invite) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Einladungscode', style: theme.textTheme.titleLarge),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          decoration: BoxDecoration(
            color: theme.colorScheme.secondaryContainer,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          ),
          child: SelectableText(
            invite.code,
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontFamily: 'monospace',
              letterSpacing: 3,
              color: theme.colorScheme.onSecondaryContainer,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          invite.expiresAt == null
              ? 'Gültig ohne Ablaufdatum.'
              : 'Gültig bis ${Formatters.dateTime(invite.expiresAt!)}. '
                    'Teile den Code jetzt – er kann später nicht erneut angezeigt werden.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(label: 'Code kopieren', icon: Icons.copy, onPressed: _copy),
        const SizedBox(height: AppSpacing.xs),
        AppButton.text(label: 'Fertig', onPressed: () => Navigator.of(context).pop()),
      ],
    );
  }
}
