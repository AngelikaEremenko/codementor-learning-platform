# -*- coding: utf-8 -*-
"""Создаёт демонстрационный профиль для записи видео.

Профиль настроен так, что в модуле 1 пройдены ВСЕ теории, кроме последней.
Это позволяет на видео вживую закрыть последнюю теорию (мини-задания + тест),
тем самым разблокировать задачи, и затем решить базовую задачу и
задачу-вариацию с запросом подсказок разного уровня.

Запуск:
    python manage.py seed_demo_profile
    python manage.py seed_demo_profile --email demo@codementor.local --password Demo12345!

Команду можно запускать повторно: прогресс демо-пользователя сбрасывается
и пересоздаётся заново.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

from learning.models import Module, Theory, TheoryProgress, UserProgress

User = get_user_model()

DEFAULT_EMAIL = 'demo@codementor.local'
DEFAULT_PASSWORD = 'Demo12345!'
# 3 пройденные теории модуля 1 дают ровно 3 балла (+1 за каждую),
# как и работает система: стартовый баланс 0, начисление за теорию +1.
DEFAULT_POINTS = 3


class Command(BaseCommand):
    help = 'Создаёт демо-профиль с пройденными теориями модуля 1, кроме последней.'

    def add_arguments(self, parser):
        parser.add_argument('--email', default=DEFAULT_EMAIL)
        parser.add_argument('--password', default=DEFAULT_PASSWORD)
        parser.add_argument('--points', type=int, default=DEFAULT_POINTS)
        parser.add_argument(
            '--module-order', type=int, default=None,
            help='Порядок модуля (по умолчанию первый модуль).',
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        email = opts['email']
        password = opts['password']
        points = opts['points']

        # 1. Модуль
        if opts['module_order'] is not None:
            module = Module.objects.filter(order=opts['module_order']).first()
        else:
            module = Module.objects.order_by('order').first()
        if module is None:
            self.stderr.write('Модули не найдены. Сначала выполните seed_curriculum.')
            return

        theories = list(module.theories.order_by('order'))
        if len(theories) < 2:
            self.stderr.write(
                f'В модуле «{module.title}» меньше двух теорий, '
                f'демо «всё кроме последней» не имеет смысла.'
            )
            return

        completed = theories[:-1]
        last = theories[-1]

        # 2. Пользователь (создаём или обновляем)
        user, created = User.objects.get_or_create(
            email=email,
            defaults={'username': email},
        )
        user.set_password(password)
        user.points = points
        user.email_verified = True
        user.is_active = True
        user.save()

        # 3. Полный сброс прогресса демо-пользователя, чтобы команда была повторяемой
        TheoryProgress.objects.filter(user=user).delete()
        UserProgress.objects.filter(user=user).delete()
        # Сабмишены и запросы подсказок — мягко, если приложения присутствуют
        try:
            from solutions.models import Submission
            Submission.objects.filter(user=user).delete()
        except Exception:
            pass
        try:
            from assistant.models import HintRequest
            HintRequest.objects.filter(user=user).delete()
        except Exception:
            pass

        # 4. Отмечаем пройденными все теории, кроме последней
        for theory in completed:
            mini_ids = list(theory.mini_tasks.values_list('id', flat=True))
            quiz_total = 0
            quiz_score = 0
            if hasattr(theory, 'quiz'):
                quiz_total = theory.quiz.questions.count()
                quiz_score = quiz_total  # 100%, заведомо >= 75%
            tp = TheoryProgress.objects.create(
                user=user,
                theory=theory,
                mini_tasks_passed=mini_ids,
                quiz_score=quiz_score,
                quiz_total=quiz_total,
                points_awarded=True,
            )
            status = 'завершена' if tp.is_completed() else 'НЕ завершена (проверь данные)'
            self.stdout.write(f'  [x] «{theory.title}» — {status}')

        self.stdout.write(
            f'  [ ] «{last.title}» — оставлена открытой для демонстрации'
        )

        # 5. Итог
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Демо-профиль готов.'))
        self.stdout.write(f'  Модуль:  {module.title}')
        self.stdout.write(f'  Логин:   {email}')
        self.stdout.write(f'  Пароль:  {password}')
        self.stdout.write(f'  Баллы:   {points}')
        self.stdout.write(
            f'  Пройдено теорий: {len(completed)} из {len(theories)}, '
            f'последняя «{last.title}» открыта для прохождения на видео.'
        )
