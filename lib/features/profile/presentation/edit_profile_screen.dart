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
import '../../authentication/presentation/auth_providers.dart';
import '../domain/profile.dart';
import 'profile_providers.dart';

class EditProfileScreen extends ConsumerWidget {
  const EditProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profil bearbeiten')),
      body: AsyncValueView<Profile>(
        value: ref.watch(currentProfileProvider),
        onRetry: () => ref.invalidate(currentProfileProvider),
        data: (profile) => _ProfileForm(profile: profile),
      ),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({required this.profile});

  final Profile profile;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  final _formKey = GlobalKey<FormState>();
  late final _displayName = TextEditingController(text: widget.profile.displayName);
  late final _username = TextEditingController(text: widget.profile.username ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _displayName.dispose();
    _username.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(profileRepositoryProvider)
          .updateProfile(
            userId: ref.read(currentUserIdProvider),
            username: _username.text,
            displayName: _displayName.text,
          );
      ref.invalidate(currentProfileProvider);
      if (!mounted) return;
      showAppSnackBar(context, 'Profil gespeichert.');
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
            label: 'Anzeigename',
            controller: _displayName,
            prefixIcon: Icons.badge_outlined,
            hint: 'z. B. Max Mustermann',
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            maxLength: 60,
            validator: Validators.displayName,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            label: 'Benutzername',
            controller: _username,
            prefixIcon: Icons.alternate_email,
            hint: 'z. B. max_mustermann',
            helper: 'Eindeutig, 3–24 Zeichen: a–z, 0–9 und _',
            autocorrect: false,
            textInputAction: TextInputAction.done,
            maxLength: 24,
            validator: (v) => Validators.username(v?.toLowerCase()),
            onSubmitted: (_) => _save(),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Speichern', icon: Icons.check, isLoading: _saving, onPressed: _save),
        ],
      ),
    );
  }
}
