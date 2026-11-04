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
import 'groups_providers.dart';

class CreateGroupScreen extends ConsumerStatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  ConsumerState<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends ConsumerState<CreateGroupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      final group = await ref
          .read(groupsRepositoryProvider)
          .createGroup(name: _name.text, description: _description.text);
      invalidateGroupData(ref);
      if (!mounted) return;
      showAppSnackBar(context, 'Gruppe „${group.name}“ wurde erstellt.');
      context.pushReplacement(Routes.group(group.id));
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gruppe erstellen')),
      body: Form(
        key: _formKey,
        child: PageBody(
          children: [
            Text(
              'Du wirst automatisch Owner der Gruppe und kannst anschließend Mitglieder einladen und Reviere anlegen.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              label: 'Gruppenname',
              controller: _name,
              prefixIcon: Icons.groups_outlined,
              hint: 'z. B. Jagdfreunde Hochwald',
              textCapitalization: TextCapitalization.sentences,
              maxLength: 80,
              validator: Validators.groupName,
            ),
            const SizedBox(height: AppSpacing.sm),
            AppTextField(
              label: 'Beschreibung (optional)',
              controller: _description,
              maxLines: 4,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              validator: Validators.maxLength(1000),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: 'Gruppe erstellen', icon: Icons.check, isLoading: _saving, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
