import 'revier.dart';

abstract interface class ReviereRepository {
  /// Alle Reviere, die der Benutzer sehen darf (über alle Gruppen).
  Future<List<Revier>> fetchAll();

  Future<List<Revier>> fetchForGroup(String groupId);

  Future<Revier> fetchById(String revierId);

  Future<Revier> create({
    required String groupId,
    required String createdBy,
    required String name,
    required String description,
  });

  Future<Revier> update({required String revierId, required String name, required String description});

  Future<void> delete(String revierId);
}
