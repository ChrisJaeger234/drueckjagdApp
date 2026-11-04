import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../../groups/domain/hunting_group.dart';
import '../../groups/presentation/groups_providers.dart';
import '../domain/revier.dart';
import 'reviere_providers.dart';

/// Revier anlegen ([revierId] == null) oder bearbeiten.
class RevierFormScreen extends ConsumerWidget {
  const RevierFormScreen({super.key, required this.groupId, this.revierId});

  final String groupId;
  final String? revierId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final group = ref.watch(myGroupProvider(groupId));
    final revier = revierId == null ? null : ref.watch(revierProvider(revierId!));

    return Scaffold(
      appBar: AppBar(title: Text(revierId == null ? 'Revier anlegen' : 'Revier bearbeiten')),
      body: AsyncValueView<MyGroup>(
        value: group,
        onRetry: () => ref.invalidate(myGroupProvider(groupId)),
        data: (g) {
          if (!g.permissions.canEditRevier) {
            return const EmptyState(
              icon: Icons.lock_outline,
              title: 'Keine Berechtigung',
              message: 'Nur Owner und Admins können Reviere anlegen und bearbeiten.',
            );
          }
          if (revier == null) return _RevierForm(group: g);
          return AsyncValueView<Revier>(
            value: revier,
            onRetry: () => ref.invalidate(revierProvider(revierId!)),
            data: (r) => _RevierForm(group: g, existing: r),
          );
        },
      ),
    );
  }
}

class _RevierForm extends ConsumerStatefulWidget {
  const _RevierForm({required this.group, this.existing});

  final MyGroup group;
  final Revier? existing;

  @override
  ConsumerState<_RevierForm> createState() => _RevierFormState();
}

class _RevierFormState extends ConsumerState<_RevierForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _description = TextEditingController(text: widget.existing?.description ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final repo = ref.read(reviereRepositoryProvider);
    final groupId = widget.group.group.id;
    try {
      final existing = widget.existing;
      final saved = existing == null
          ? await repo.create(
              groupId: groupId,
              createdBy: ref.read(currentUserIdProvider),
              name: _name.text,
              description: _description.text,
            )
          : await repo.update(revierId: existing.id, name: _name.text, description: _description.text);
      invalidateRevierData(ref, groupId: groupId, revierId: saved.id);
      if (!mounted) return;
      showAppSnackBar(context, existing == null ? 'Revier wurde angelegt.' : 'Revier gespeichert.');
      if (existing == null) {
        context.pushReplacement(Routes.revier(groupId, saved.id));
      } else {
        context.pop();
      }
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      child: PageBody(
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.groups_outlined),
              title: Text(widget.group.group.name),
              subtitle: const Text('Zugeordnete Gruppe'),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Reviername',
            controller: _name,
            prefixIcon: Icons.terrain_outlined,
            hint: 'z. B. Revier Hochwald Nord',
            textCapitalization: TextCapitalization.sentences,
            maxLength: 120,
            validator: Validators.revierName,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Beschreibung (optional)',
            controller: _description,
            hint: 'Lage, Größe, Besonderheiten, Ansprechpartner …',
            maxLines: 5,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            validator: Validators.maxLength(2000),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Reviergrenzen und Einrichtungen werden in Phase 2 auf der Karte ergänzt.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: widget.existing == null ? 'Revier anlegen' : 'Speichern',
            icon: Icons.check,
            isLoading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
