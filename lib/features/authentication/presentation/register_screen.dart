import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/errors/error_mapper.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/dialogs.dart';
import '../domain/app_user.dart';
import 'auth_providers.dart';
import 'widgets/auth_scaffold.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  /// E-Mail, an die eine Bestätigung verschickt wurde (Erfolgszustand).
  String? _confirmationSentTo;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final result = await ref.read(authControllerProvider.notifier).signUp(email: _email.text, password: _password.text);
    if (!mounted) return;
    if (result == SignUpResult.confirmationRequired) {
      setState(() => _confirmationSentTo = _email.text.trim());
    }
    // Bei SignUpResult.signedIn leitet der Router automatisch weiter.
  }

  Future<void> _resend() async {
    final ok = await ref.read(authControllerProvider.notifier).resendConfirmation(_confirmationSentTo!);
    if (!mounted) return;
    if (ok) {
      showAppSnackBar(context, 'Bestätigungs-E-Mail wurde erneut gesendet.');
    } else {
      showErrorSnackBar(context, ref.read(authControllerProvider).error!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);

    if (_confirmationSentTo != null) {
      return AuthScaffold(
        title: 'Fast geschafft',
        subtitle: 'Bitte bestätige deine E-Mail-Adresse.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(Icons.mark_email_read_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Wir haben eine E-Mail an $_confirmationSentTo geschickt. '
              'Öffne den Link darin, um dein Konto zu aktivieren, und melde dich anschließend an.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: 'Zur Anmeldung', onPressed: () => context.go(Routes.login)),
            const SizedBox(height: AppSpacing.xs),
            AppButton.text(label: 'E-Mail erneut senden', isLoading: state.isLoading, onPressed: _resend),
          ],
        ),
      );
    }

    final error = state.hasError ? ErrorMapper.map(state.error!) : null;

    return AuthScaffold(
      title: 'Konto erstellen',
      subtitle: 'Registriere dich mit E-Mail und Passwort.',
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
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
                helper: 'Mindestens ${Validators.minPasswordLength} Zeichen mit Buchstaben und Ziffern.',
                validator: Validators.password,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Passwort bestätigen',
                controller: _confirm,
                prefixIcon: Icons.lock_outline,
                obscure: true,
                textInputAction: TextInputAction.done,
                validator: (v) => Validators.passwordConfirmation(v, _password.text),
                onSubmitted: (_) => _submit(),
              ),
              if (error != null) ...[const SizedBox(height: AppSpacing.md), FormErrorBanner(error.message)],
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: 'Registrieren', isLoading: state.isLoading, onPressed: _submit),
              const SizedBox(height: AppSpacing.sm),
              AppButton.text(
                label: 'Bereits registriert? Anmelden',
                onPressed: state.isLoading ? null : () => context.go(Routes.login),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
