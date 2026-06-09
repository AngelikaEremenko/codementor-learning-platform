"""
Создаёт тестовых пользователей с реалистичным потоком submissions для апробации
работы адаптивного алгоритма и ИИ-наставника.

Профили студентов:
  - strong  (25%): высокая успешность, быстрое решение, редкие подсказки
  - medium  (50%): средняя успешность, среднее время, иногда подсказки
  - weak    (25%): низкая успешность, долго, часто подсказки

Запуск:
    python manage.py seed_test_users
    python manage.py seed_test_users --count 50 --clear
    python manage.py seed_test_users --seed 42       # для воспроизводимости
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from users.models import User
from learning.models import Module, Theory, MiniTask, UserProgress, TheoryProgress
from solutions.models import Submission
from solutions.views import TASK_POINTS, MODULE_COMPLETE_POINTS
from learning.views import THEORY_COMPLETE_POINTS
from assistant.models import HintRequest


# Профили — параметры поведения «студента».
# Философия: ВСЕ профили доходят до конца курса. Разница лишь в количестве
# попыток, времени и частоте использования подсказок. Это и есть основная
# ценность адаптивной платформы — помочь любому ученику пройти материал.
PROFILES = {
    'strong': {
        'p_correct_base': 0.75,      # базовый шанс правильной попытки
        'time_range': (60, 600),     # время одной попытки, сек
        'p_hint': 0.10,              # шанс использовать подсказку при неудаче
        'max_attempts': 4,           # максимум попыток на задачу (всегда решается)
        # На сколько модулей студент успел добраться. Реалистично: успели не все.
        'progress_range': (7, 9),
    },
    'medium': {
        'p_correct_base': 0.45,
        'time_range': (300, 1500),
        'p_hint': 0.35,
        'max_attempts': 6,
        'progress_range': (5, 9),
    },
    'weak': {
        'p_correct_base': 0.20,
        'time_range': (900, 2700),   # 15–45 минут — T = 0..1
        'p_hint': 0.65,
        'max_attempts': 10,          # слабым нужно больше попыток
        'progress_range': (3, 7),
    },
}

# Множитель шанса успеха в следующей попытке после использования подсказки.
# Это и есть числовая модель «ИИ-наставник реально помогает».
HINT_BOOST = 1.8

# Доли студентов по профилям
PROFILE_DISTRIBUTION = ['strong'] * 25 + ['medium'] * 50 + ['weak'] * 25

# Списки для генерации имён
FIRST_NAMES = [
    'Анна', 'Борис', 'Виктор', 'Галина', 'Дмитрий', 'Елена', 'Жанна', 'Захар',
    'Ирина', 'Кирилл', 'Лариса', 'Михаил', 'Наталья', 'Олег', 'Полина',
    'Роман', 'Светлана', 'Тимур', 'Ульяна', 'Фёдор', 'Хелена', 'Цезарь',
    'Чулпан', 'Шамиль', 'Эльвира', 'Юрий', 'Яна',
]
LAST_NAMES = [
    'Иванов', 'Петров', 'Сидоров', 'Козлов', 'Морозов', 'Волков', 'Соколов',
    'Лебедев', 'Новиков', 'Фёдоров', 'Орлов', 'Семёнов', 'Павлов', 'Никитин',
    'Захаров', 'Степанов', 'Кузнецов', 'Романов', 'Васильев', 'Зайцев',
]


def _random_past_datetime(days_ago_max: int) -> 'timezone.datetime':
    now = timezone.now()
    delta = timedelta(
        days=random.randint(0, days_ago_max),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )
    return now - delta


SAMPLE_CODE_TEMPLATES = {
    'accepted': '''#include <iostream>
using namespace std;
int main() {
    // решение принято
    return 0;
}
''',
    'wrong': '''#include <iostream>
using namespace std;
int main() {
    // неверный ответ
    return 0;
}
''',
    'error': '''#include <iostream>
using namespace std;
int main() {
    cout << x;   // переменная не объявлена
    return 0;
}
''',
    'timeout': '''#include <iostream>
using namespace std;
int main() {
    while (true) {}
    return 0;
}
''',
}

ERROR_MESSAGES = {
    'error': 'error: \'x\' was not declared in this scope',
    'timeout': 'Превышено время выполнения (10 сек).',
}


class Command(BaseCommand):
    help = 'Создаёт тестовых пользователей с реалистичными submissions.'

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=30,
                            help='Сколько тестовых студентов создать (по умолчанию 30).')
        parser.add_argument('--clear', action='store_true',
                            help='Сначала удалить всех не-staff пользователей.')
        parser.add_argument('--seed', type=int, default=42,
                            help='Seed для random (для воспроизводимости).')

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(options['seed'])
        count = options['count']

        if options['clear']:
            n, _ = User.objects.filter(is_staff=False, is_superuser=False).delete()
            self.stdout.write(f'Удалено тестовых пользователей: {n}')

        modules = list(Module.objects.filter(is_active=True).order_by('order'))
        if not modules:
            self.stdout.write(self.style.ERROR(
                'В БД нет модулей. Сначала выполни python manage.py seed_curriculum.'
            ))
            return

        self.stdout.write(f'Создаю {count} студентов...\n')

        created_users = []
        for i in range(count):
            profile_name = PROFILE_DISTRIBUTION[i % len(PROFILE_DISTRIBUTION)]
            user = self._create_student(i + 1, profile_name)
            created_users.append((user, profile_name))
            self._simulate_progress(user, profile_name, modules)
            self.stdout.write(f'  [{i+1:>3}/{count}] {profile_name:6} {user.username} '
                              f'({user.email})')

        # Итоговая статистика
        self.stdout.write(self.style.SUCCESS(
            f'\nГотово.\n'
            f'  Пользователей: {User.objects.filter(is_staff=False).count()}\n'
            f'  Submissions:   {Submission.objects.count()}\n'
            f'  TheoryProgress: {TheoryProgress.objects.count()}\n'
            f'  UserProgress:  {UserProgress.objects.count()}\n'
            f'  HintRequests:  {HintRequest.objects.count()}'
        ))

    def _create_student(self, idx: int, profile: str) -> User:
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        username = f'{first}_{last}_{idx:03d}'
        email = f'student{idx:03d}@test.local'

        user = User.objects.create_user(
            email=email,
            username=username,
            password='Test1234!',
            first_name=first,
            last_name=last,
        )
        user.email_verified = True
        # Регистрация — равномерно за последние 30 дней
        registered_at = _random_past_datetime(30)
        user.registered_at = registered_at
        user.save()
        # Поинты — оставляем дефолт 15, плюс начислятся за accepted submissions
        return user

    def _simulate_progress(self, user, profile_name: str, modules: list) -> None:
        profile = PROFILES[profile_name]
        # До какого модуля студент успел дойти за время, прошедшее с регистрации
        n_modules = random.randint(*profile['progress_range'])
        for module in modules[:n_modules]:
            self._complete_theories(user, module, profile)
            self._solve_module_tasks(user, module, profile)

    def _complete_theories(self, user, module, profile) -> None:
        """Имитирует прохождение теорий: все мини-задания + квиз ≥75%.

        В адаптивной платформе все студенты доходят до прохождения; разница —
        только в баллах квиза (слабые набирают ровно проходной минимум).
        За каждое полное прохождение теории начисляется THEORY_COMPLETE_POINTS.
        """
        base = profile['p_correct_base']
        for theory in module.theories.all():
            mini_task_ids = list(theory.mini_tasks.values_list('id', flat=True))
            quiz_total = theory.quiz.questions.count() if hasattr(theory, 'quiz') else 0
            if base > 0.7:
                score_ratio = random.uniform(0.9, 1.0)
            elif base > 0.4:
                score_ratio = random.uniform(0.8, 0.95)
            else:
                score_ratio = random.uniform(0.75, 0.85)
            quiz_score = int(round(quiz_total * score_ratio))
            TheoryProgress.objects.update_or_create(
                user=user, theory=theory,
                defaults={
                    'mini_tasks_passed': mini_task_ids,
                    'quiz_score': quiz_score,
                    'quiz_total': quiz_total,
                    'points_awarded': True,
                },
            )
            user.points += THEORY_COMPLETE_POINTS

    def _solve_module_tasks(self, user, module, profile) -> None:
        """Имитирует решение задач модуля. В адаптивной платформе студент ВСЕГДА
        в итоге решает каждую задачу (за счёт попыток и AI-подсказок) — поэтому
        мы не моделируем «бросил задачу». Разница между профилями — в количестве
        попыток, времени и частоте использования AI-помощи.
        """
        progress, _ = UserProgress.objects.get_or_create(
            user=user, module=module,
            defaults={'solved_count': 0},
        )

        # Берём только основные задачи модуля — вариации в seed не моделируем
        tasks = list(
            module.tasks.filter(parent_task__isnull=True)
            .order_by('difficulty', 'order')
        )
        for task in tasks:
            self._attempt_task(user, task, profile, progress)
            user.points += TASK_POINTS.get(task.difficulty, 1)

        # Бонус за полное прохождение модуля
        user.points += MODULE_COMPLETE_POINTS
        user.save(update_fields=['points'])

    def _attempt_task(self, user, task, profile, progress) -> int:
        """Имитирует попытки решения одной задачи. Возвращает количество попыток.

        Модель: первая попытка имеет базовый шанс; при неудаче студент
        может использовать AI-подсказку — следующая попытка получает HINT_BOOST.
        После max_attempts студент гарантированно «дожимает» — это поведение
        реальной адаптивной системы, где никто не остаётся без решения.
        """
        # Базовая вероятность зависит от уровня сложности задачи и профиля
        # обучающегося. Адаптивного «уровня обучающегося» в системе нет, поэтому
        # снижение вероятности применяется только к более сложным задачам.
        if task.difficulty == 1:
            base_p = min(0.95, profile['p_correct_base'] * 1.2)
        elif task.difficulty == 2:
            base_p = profile['p_correct_base']
        else:
            base_p = profile['p_correct_base'] * 0.6

        max_hint_level_in_task = 0    # максимум уровня подсказки за время решения задачи
        recent_hint_boost = False     # последняя попытка после подсказки — повышенный шанс
        max_attempts = profile['max_attempts']

        for attempt_idx in range(max_attempts):
            is_final = (attempt_idx == max_attempts - 1)
            # Шанс правильного ответа
            p = min(0.92, base_p + 0.05 * attempt_idx)
            if recent_hint_boost:
                p = min(0.95, p * HINT_BOOST)
                recent_hint_boost = False
            # На последней попытке гарантированно решает (адаптивная платформа доводит до результата)
            if is_final:
                p = 1.0

            accepted = random.random() < p
            time_spent = random.randint(*profile['time_range'])
            status = 'accepted' if accepted else random.choices(
                ['wrong', 'error', 'timeout'], weights=[7, 2, 1]
            )[0]

            # Подсказка запрашивается только при провале и с вероятностью p_hint
            use_hint_now = (not accepted) and (random.random() < profile['p_hint'])
            code = SAMPLE_CODE_TEMPLATES[status]
            submission = Submission.objects.create(
                user=user, task=task, code=code,
                status=status,
                test_results=[],
                error_message=ERROR_MESSAGES.get(status, ''),
                time_spent=time_spent,
                used_hint=(max_hint_level_in_task > 0),
                max_hint_level=max_hint_level_in_task,
            )
            submitted_at = user.registered_at + timedelta(
                days=random.randint(0, 25),
                hours=random.randint(0, 23),
            )
            Submission.objects.filter(pk=submission.pk).update(submitted_at=submitted_at)

            if use_hint_now:
                hint_level = random.choice([1, 1, 2])
                HintRequest.objects.create(
                    user=user, task=task,
                    user_code=code,
                    hint_text='(тестовая подсказка для апробации)',
                    hint_level=hint_level,
                )
                # Списываем поинты только за уровень 2 — уровень 1 бесплатный
                if hint_level == 2:
                    user.points = max(0, user.points - 3)
                max_hint_level_in_task = max(max_hint_level_in_task, hint_level)
                recent_hint_boost = True

            if accepted:
                return attempt_idx + 1

        return max_attempts
