/// Zentrale Pfaddefinitionen.
abstract final class Routes {
  static const splash = '/splash';
  static const login = '/login';
  static const register = '/register';

  static const overview = '/overview';
  static const map = '/map';
  static const groups = '/groups';
  static const chat = '/chat';
  static const profile = '/profile';

  static const profileEdit = '/profile/edit';
  static const groupCreate = '/groups/new';
  static const groupJoin = '/groups/join';

  static String group(String groupId) => '/groups/$groupId';
  static String groupEdit(String groupId) => '/groups/$groupId/edit';
  static String revierCreate(String groupId) => '/groups/$groupId/reviere/new';
  static String revier(String groupId, String revierId) => '/groups/$groupId/reviere/$revierId';
  static String revierEdit(String groupId, String revierId) => '/groups/$groupId/reviere/$revierId/edit';

  static String huntCreate(String groupId) => '/hunts/new?group=$groupId';
  static String hunt(String huntId) => '/hunts/$huntId';
  static String huntEdit(String huntId) => '/hunts/$huntId/edit';
  static String standCreate(String huntId) => '/hunts/$huntId/stands/new';
  static String standEdit(String huntId, String standId) => '/hunts/$huntId/stands/$standId/edit';

  /// Ohne Anmeldung erreichbar.
  static const public = {login, register};
}
