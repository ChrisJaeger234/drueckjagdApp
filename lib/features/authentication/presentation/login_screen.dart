import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/errors/error_mapper.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import 'auth_providers.dart';
import 'widgets/auth_scaffold.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    await ref.read(authControllerProvider.notifier).signIn(email: _email.text, password: _password.text);
    // Bei Erfolg leitet der Router automatisch zur Übersicht weiter.
  }

  Future<void> _resend() async {
    final ok = await ref.read(authControllerProvider.notifier).resendConfirmation(_email.text);
    if (ok && mounted) showAppSnackBar(context, 'Bestätigungs-E-Mail wurde erneut gesendet.');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final error = state.hasError ? ErrorMapper.map(state.error!) : null;

    return AuthScaffold(
      title: 'Anmelden',
      subtitle: 'Willkommen zurück. Melde dich mit deinem Konto an.',
      child: AutofillGroup(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                label: 'E-Mail',
                controller: _email,
                prefixIcon: Icons.mail_outline,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                autocorrect: false,
                validator: Validators.email,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Passwort',
                controller: _password,
                prefixIcon: Icons.lock_outline,
                obscure: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                validator: Validators.loginPassword,
                onSubmitted: (_) => _submit(),
              ),
              if (error != null) ...[
                const SizedBox(height: AppSpacing.md),
                FormErrorBanner(error.message),
                if (error.kind == AppErrorKind.emailNotConfirmed)
                  AppButton.text(label: 'Bestätigungs-E-Mail erneut senden', onPressed: _resend),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: 'Anmelden', isLoading: state.isLoading, onPressed: _submit),
              const SizedBox(height: AppSpacing.sm),
              AppButton.text(
                label: 'Noch kein Konto? Jetzt registrieren',
                onPressed: state.isLoading ? null : () => context.go(Routes.register),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
