import 'package:flutter/material.dart';

/// Einheitliches Eingabefeld mit Label, Validierung und optionalem
/// Sichtbarkeits-Umschalter für Passwörter.
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.helper,
    this.validator,
    this.keyboardType,
    this.textInputAction,
    this.onSubmitted,
    this.autofillHints,
    this.prefixIcon,
    this.obscure = false,
    this.enabled = true,
    this.maxLines = 1,
    this.maxLength,
    this.textCapitalization = TextCapitalization.none,
    this.autocorrect = true,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helper;
  final String? Function(String?)? validator;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String>? autofillHints;
  final IconData? prefixIcon;
  final bool obscure;
  final bool enabled;
  final int maxLines;
  final int? maxLength;
  final TextCapitalization textCapitalization;
  final bool autocorrect;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late bool _hidden = widget.obscure;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      validator: widget.validator,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onSubmitted,
      autofillHints: widget.autofillHints,
      obscureText: _hidden,
      enabled: widget.enabled,
      maxLines: widget.obscure ? 1 : widget.maxLines,
      maxLength: widget.maxLength,
      textCapitalization: widget.textCapitalization,
      autocorrect: widget.obscure ? false : widget.autocorrect,
      enableSuggestions: !widget.obscure,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        helperText: widget.helper,
        helperMaxLines: 2,
        errorMaxLines: 3,
        prefixIcon: widget.prefixIcon != null ? Icon(widget.prefixIcon) : null,
        suffixIcon: widget.obscure
            ? IconButton(
                tooltip: _hidden ? 'Passwort anzeigen' : 'Passwort verbergen',
                icon: Icon(_hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _hidden = !_hidden),
              )
            : null,
      ),
    );
  }
}
