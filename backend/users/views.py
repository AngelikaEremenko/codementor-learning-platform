from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    RegisterSerializer,
    UserSerializer,
    ProfileUpdateSerializer,
    ChangePasswordSerializer,
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)


class LoginView(TokenObtainPairView):
    """Стандартный JWT-логин (email-верификация отключена)."""
    pass


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        return self.request.user


@api_view(['PATCH'])
@permission_classes([permissions.IsAuthenticated])
def update_profile(request):
    """Изменение профиля. Сейчас доступно только поле username."""
    serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(UserSerializer(request.user, context={'request': request}).data)


@api_view(['POST', 'DELETE'])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def update_avatar(request):
    """Загрузка/удаление аватара пользователя.

    POST: multipart/form-data с полем `avatar` (image file).
    DELETE: удалить текущий аватар.
    """
    user = request.user
    if request.method == 'DELETE':
        if user.avatar:
            user.avatar.delete(save=False)
            user.avatar = None
            user.save(update_fields=['avatar'])
        return Response(UserSerializer(user, context={'request': request}).data)

    file = request.FILES.get('avatar')
    if not file:
        return Response({'detail': 'Поле avatar обязательно.'},
                        status=status.HTTP_400_BAD_REQUEST)

    # Ограничение по размеру: 2 МБ.
    if file.size > 2 * 1024 * 1024:
        return Response({'detail': 'Размер файла не должен превышать 2 МБ.'},
                        status=status.HTTP_400_BAD_REQUEST)

    if user.avatar:
        user.avatar.delete(save=False)
    user.avatar = file
    user.save(update_fields=['avatar'])
    return Response(UserSerializer(user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def change_password(request):
    """Смена пароля авторизованным пользователем.

    Тело: {"current_password": "...", "new_password": "..."}
    """
    serializer = ChangePasswordSerializer(data=request.data, context={'user': request.user})
    serializer.is_valid(raise_exception=True)

    if not request.user.check_password(serializer.validated_data['current_password']):
        return Response({'current_password': ['Неверный текущий пароль.']},
                        status=status.HTTP_400_BAD_REQUEST)

    request.user.set_password(serializer.validated_data['new_password'])
    request.user.save(update_fields=['password'])
    return Response({'detail': 'Пароль успешно изменён.'})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def profile_stats(request):
    """Статистика пользователя для страницы профиля.

    Возвращает прогресс по основным задачам и теоретическим разделам.
    Вариации задач в счёте не учитываются: они являются вспомогательным
    механизмом закрепления, а не самостоятельными учебными единицами.
    """
    from learning.models import Module, Theory, TheoryProgress
    from solutions.mastery import get_task_mastery

    user = request.user
    is_admin = user.is_staff or user.is_superuser

    modules = list(Module.objects.filter(is_active=True).prefetch_related('tasks', 'theories'))

    # Основные задачи курса (без вариаций)
    main_tasks = [t for m in modules for t in m.tasks.all() if t.parent_task_id is None]
    main_tasks_total = len(main_tasks)
    if is_admin:
        mastered_tasks = main_tasks_total
    else:
        mastered_tasks = sum(
            1 for t in main_tasks if get_task_mastery(user, t) == 'mastered'
        )

    # Теории
    theories = [t for m in modules for t in m.theories.all()]
    theories_total = len(theories)
    if is_admin:
        theories_completed = theories_total
    else:
        tp_map = {
            tp.theory_id: tp
            for tp in TheoryProgress.objects.filter(user=user, theory_id__in=[t.id for t in theories])
        }
        theories_completed = sum(
            1 for t in theories
            if (tp := tp_map.get(t.id)) and tp.is_completed()
        )

    # Модули полностью пройдены: все основные задачи модуля mastered
    modules_completed = 0
    for module in modules:
        m_main_tasks = [t for t in module.tasks.all() if t.parent_task_id is None]
        if not m_main_tasks:
            continue
        if is_admin:
            modules_completed += 1
            continue
        if all(get_task_mastery(user, t) == 'mastered' for t in m_main_tasks):
            modules_completed += 1

    return Response({
        'mastered_tasks': mastered_tasks,
        'main_tasks_total': main_tasks_total,
        'theories_completed': theories_completed,
        'theories_total': theories_total,
        'modules_completed': modules_completed,
        'modules_total': len(modules),
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def tag_stats(request):
    """Аналитика пользователя в разрезе тем задач.

    Считаем по **уникальным задачам**, а не по попыткам: пользователь может
    реально повлиять на свой показатель, дорешав оставшиеся задачи темы.

    tasks_tried — сколько уникальных задач с этой темой пользователь хотя бы пробовал.
    tasks_solved — сколько из них он решил (есть accepted submission).
    """
    from django.db.models import Count
    from solutions.models import Submission
    from learning.models import Tag, Task

    user = request.user

    # Собираем все submissions пользователя + теги задач за один проход
    submissions = (
        Submission.objects
        .filter(user=user)
        .select_related('task')
        .prefetch_related('task__tags')
    )

    by_tag = {}   # tag_id -> {'tag': Tag, 'tried': set(task_id), 'solved': set(task_id)}
    for sub in submissions:
        accepted = (sub.status == 'accepted')
        for tag in sub.task.tags.all():
            data = by_tag.setdefault(tag.id, {'tag': tag, 'tried': set(), 'solved': set()})
            data['tried'].add(sub.task_id)
            if accepted:
                data['solved'].add(sub.task_id)

    # Сколько всего задач с такой темой существует в курсе (нужно чтобы показать
    # пользователю «решил 3 из 4 — есть ещё одна нерешённая»).
    tag_ids = list(by_tag.keys())
    total_in_course = {
        row['tags']: row['c']
        for row in Task.objects.filter(tags__in=tag_ids).values('tags').annotate(c=Count('id'))
    }

    items = []
    for tag_id, d in by_tag.items():
        tag = d['tag']
        tried = len(d['tried'])
        solved = len(d['solved'])
        rate = round(100 * solved / tried, 1) if tried else 0
        items.append({
            'slug': tag.slug,
            'name': tag.name,
            'tasks_tried': tried,
            'tasks_solved': solved,
            'tasks_total_in_course': total_in_course.get(tag_id, tried),
            'completion_rate': rate,
        })

    items.sort(key=lambda x: x['completion_rate'])

    weak = [x for x in items if x['completion_rate'] < 60][:5]
    strong = sorted([x for x in items if x['completion_rate'] >= 75],
                    key=lambda x: -x['completion_rate'])[:5]

    return Response({
        'all': items,
        'weak_topics': weak,
        'strong_topics': strong,
    })
