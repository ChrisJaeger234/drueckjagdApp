import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/app_spacing.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import '../../../core/widgets/layout.dart';
import '../../../core/widgets/state_views.dart';
import '../domain/hunting_group.dart';
import 'groups_providers.dart';

/// Gruppe bearbeiten – nur für Owner (serverseitig per RLS erzwungen).
class EditGroupScreen extends ConsumerWidget {
  const EditGroupScreen({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gruppe bearbeiten')),
      body: AsyncValueView<MyGroup>(
        value: ref.watch(myGroupProvider(groupId)),
        onRetry: () => ref.invalidate(myGroupProvider(groupId)),
        data: (g) => g.permissions.canEditGroup
            ? _EditGroupForm(group: g.group)
            : const EmptyState(
                icon: Icons.lock_outline,
                title: 'Keine Berechtigung',
                message: 'Nur Owner können die Gruppe bearbeiten.',
              ),
      ),
    );
  }
}

class _EditGroupForm extends ConsumerStatefulWidget {
  const _EditGroupForm({required this.group});

  final HuntingGroup group;

  @override
  ConsumerState<_EditGroupForm> createState() => _EditGroupFormState();
}

class _EditGroupFormState extends ConsumerState<_EditGroupForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.group.name);
  late final _description = TextEditingController(text: widget.group.description);
  late bool _adminsCanManage = widget.group.adminsCanManageMembers;
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
    try {
      await ref.read(groupsRepositoryProvider).updateGroup(
            groupId: widget.group.id,
            name: _name.text,
            description: _description.text,
            adminsCanManageMembers: _adminsCanManage,
          );
      invalidateGroupData(ref, groupId: widget.group.id);
      if (!mounted) return;
      showAppSnackBar(context, 'Gruppe gespeichert.');
      context.pop();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: PageBody(
        children: [
          AppTextField(
            label: 'Gruppenname',
            controller: _name,
            prefixIcon: Icons.groups_outlined,
            maxLength: 80,
            validator: Validators.groupName,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Beschreibung',
            controller: _description,
            maxLines: 4,
            maxLength: 1000,
            validator: Validators.maxLength(1000),
          ),
          const SizedBox(height: AppSpacing.sm),
          Card(
            child: SwitchListTile(
              value: _adminsCanManage,
              onChanged: (v) => setState(() => _adminsCanManage = v),
              title: const Text('Admins dürfen Mitglieder verwalten'),
              subtitle: const Text('Einladungscodes erstellen und Mitglieder (Rolle „Mitglied“) entfernen.'),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Speichern', icon: Icons.check, isLoading: _saving, onPressed: _save),
        ],
      ),
    );
  }
}
