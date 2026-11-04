/// Einfache deutsche Datumsformatierung (ohne zusätzliche Abhängigkeit).
abstract final class Formatters {
  static String _two(int v) => v.toString().padLeft(2, '0');

  /// z. B. 04.11.2026
  static String date(DateTime value) {
    final d = value.toLocal();
    return '${_two(d.day)}.${_two(d.month)}.${d.year}';
  }

  /// z. B. 04.11.2026, 06:30
  static String dateTime(DateTime value) {
    final d = value.toLocal();
    return '${date(d)}, ${_two(d.hour)}:${_two(d.minute)}';
  }
}
