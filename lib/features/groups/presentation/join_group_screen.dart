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

class JoinGroupScreen extends ConsumerStatefulWidget {
  const JoinGroupScreen({super.key});

  @override
  ConsumerState<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends ConsumerState<JoinGroupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  bool _joining = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _joining = true);
    try {
      final groupId = await ref.read(groupsRepositoryProvider).redeemInvite(_code.text);
      invalidateGroupData(ref, groupId: groupId);
      if (!mounted) return;
      showAppSnackBar(context, 'Willkommen in der Gruppe!');
      context.pushReplacement(Routes.group(groupId));
    } catch (e) {
      if (mounted) showErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gruppe beitreten')),
      body: Form(
        key: _formKey,
        child: PageBody(
          children: [
            Text(
              'Gib den Einladungscode ein, den du von einem Owner oder Admin der Gruppe erhalten hast.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              label: 'Einladungscode',
              controller: _code,
              prefixIcon: Icons.vpn_key_outlined,
              hint: 'ABCD-EFGH-JKMN',
              autocorrect: false,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.done,
              validator: Validators.inviteCode,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: 'Beitreten', icon: Icons.login, isLoading: _joining, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
