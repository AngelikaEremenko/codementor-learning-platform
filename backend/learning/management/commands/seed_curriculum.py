"""
Пересоздаёт учебную программу CodeMentor из определений в backend/learning/curriculum/.

По умолчанию работает в режиме **upsert** — обновляет существующие модули,
теории, задачи и мини-задания, сохраняя их идентификаторы. Это значит, что
прогресс пользователей (TheoryProgress, Submission) НЕ теряется при правке
контента.

Флаг --fresh принудительно удаляет все модули перед созданием. Подходит, если
нужно начать с чистого листа (это сбросит прогресс всех учеников).

Запуск:
    python manage.py seed_curriculum
    python manage.py seed_curriculum --fresh
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from learning.models import (
    Module, Theory, Task, Quiz, QuizQuestion, Tag, MiniTask,
)
from learning.curriculum import CURRICULUM
from learning.curriculum.tags import TAGS


class Command(BaseCommand):
    help = 'Обновляет учебную программу из learning/curriculum/. Сохраняет ID и прогресс.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fresh',
            action='store_true',
            help='Полностью очистить программу перед созданием (сбрасывает прогресс).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['fresh']:
            self.stdout.write(self.style.WARNING(
                'Режим --fresh: удаляю все модули и теги (прогресс будет потерян).'
            ))
            Module.objects.all().delete()
            Tag.objects.all().delete()

        # ---------- Tags (upsert) ----------
        tag_objs = self._upsert_tags()
        self.stdout.write(f'Тегов в каталоге: {len(tag_objs)}')

        # ---------- Modules (upsert) ----------
        seen_module_orders = set()
        for mod_data in CURRICULUM:
            seen_module_orders.add(mod_data['order'])
            self._upsert_module(mod_data, tag_objs)

        # Удаляем модули, которых больше нет в curriculum
        removed = Module.objects.exclude(order__in=seen_module_orders).delete()
        if removed[0]:
            self.stdout.write(f'Удалено устаревших модулей: {removed[0]}')

        self.stdout.write(self.style.SUCCESS(
            f'\nГотово. Модулей: {Module.objects.count()}, '
            f'теорий: {Theory.objects.count()}, '
            f'задач: {Task.objects.count()}, '
            f'тегов: {Tag.objects.count()}.'
        ))

    # ------------------------------------------------------------------
    # Tags
    # ------------------------------------------------------------------
    def _upsert_tags(self):
        # Удаляем устаревшие
        Tag.objects.exclude(slug__in=TAGS.keys()).delete()
        # Upsert
        tag_objs = {}
        for slug, name in TAGS.items():
            obj, _ = Tag.objects.update_or_create(slug=slug, defaults={'name': name})
            tag_objs[slug] = obj
        return tag_objs

    # ------------------------------------------------------------------
    # Module
    # ------------------------------------------------------------------
    def _upsert_module(self, mod_data, tag_objs):
        module, created = Module.objects.update_or_create(
            order=mod_data['order'],
            defaults={
                'title': mod_data['title'],
                'description': mod_data['description'],
                'concepts': mod_data.get('concepts', ''),
                'is_active': True,
            },
        )
        verb = 'создан' if created else 'обновлён'
        self.stdout.write(f'\n[{module.order}] {module.title} ({verb})')

        # ---- Theories ----
        seen_theory_orders = set()
        for th_data in mod_data.get('theories', []):
            seen_theory_orders.add(th_data['order'])
            self._upsert_theory(module, th_data)
        # Удалить теории, которых больше нет
        removed = module.theories.exclude(order__in=seen_theory_orders).delete()
        if removed[0]:
            self.stdout.write(f'  Удалено устаревших теорий: {removed[0]}')

        # ---- Tasks (только основные на этом шаге) ----
        seen_task_orders = set()
        for t_data in mod_data.get('tasks', []):
            seen_task_orders.add(t_data['order'])
            task = self._upsert_main_task(module, t_data, tag_objs)
            tag_label = ', '.join(t_data.get('tags', [])) or '—'
            self.stdout.write(
                f'  Задача [уровень {task.difficulty}]: {task.title}  ({tag_label})'
            )

            # ---- Variations внутри основной задачи ----
            seen_var_orders = set()
            for i, v_data in enumerate(t_data.get('variations', []) or []):
                seen_var_orders.add(i)
                variation = self._upsert_variation(module, task, i, v_data, tag_objs)
                self.stdout.write(f'    -> Вариация: {variation.title}')
            # Удалить лишние вариации этой задачи
            task.variations.exclude(order__in=seen_var_orders).delete()

        # Удалить основные задачи, которых больше нет
        module.tasks.filter(parent_task__isnull=True).exclude(
            order__in=seen_task_orders
        ).delete()

    # ------------------------------------------------------------------
    # Theory
    # ------------------------------------------------------------------
    def _upsert_theory(self, module, th_data):
        theory, _ = Theory.objects.update_or_create(
            module=module, order=th_data['order'],
            defaults={
                'title': th_data['title'],
                'content': th_data['content'],
            },
        )

        # ---- Mini-tasks ----
        seen_mini_orders = set()
        for i, mt in enumerate(th_data.get('mini_tasks', []) or []):
            seen_mini_orders.add(i)
            MiniTask.objects.update_or_create(
                theory=theory, order=i,
                defaults={
                    'title': mt['title'],
                    'description': mt['description'],
                    'starter_code': mt.get('starter_code', ''),
                    'test_cases': mt.get('tests', []),
                    'hint': mt.get('hint', ''),
                    'required_patterns': mt.get('required_patterns', []),
                    'forbidden_patterns': mt.get('forbidden_patterns', []),
                },
            )
        # Удалить лишние мини-задания
        theory.mini_tasks.exclude(order__in=seen_mini_orders).delete()

        # ---- Quiz: пересоздаём вопросы каждый раз (прогресс хранится агрегатами
        # quiz_score / quiz_total в TheoryProgress — он не ссылается на конкретные
        # ID вопросов, так что от пересоздания вопросов прогресс не страдает).
        quiz_data = th_data.get('quiz') or []
        if quiz_data:
            quiz, _ = Quiz.objects.get_or_create(theory=theory)
            quiz.questions.all().delete()
            for i, q in enumerate(quiz_data):
                QuizQuestion.objects.create(
                    quiz=quiz,
                    question=q['question'],
                    option_a=q['a'],
                    option_b=q['b'],
                    option_c=q['c'],
                    option_d=q['d'],
                    correct=q['correct'],
                    explanation=q.get('explanation', ''),
                    order=i,
                )
        else:
            Quiz.objects.filter(theory=theory).delete()

    # ------------------------------------------------------------------
    # Tasks
    # ------------------------------------------------------------------
    def _upsert_main_task(self, module, t_data, tag_objs):
        tag_slugs = t_data.get('tags', [])
        unknown = [s for s in tag_slugs if s not in tag_objs]
        if unknown:
            raise ValueError(
                f'Задача «{t_data["title"]}»: неизвестные теги {unknown}. '
                f'Добавь их в curriculum/tags.py.'
            )
        task, _ = Task.objects.update_or_create(
            module=module, parent_task=None, order=t_data['order'],
            defaults={
                'title': t_data['title'],
                'description': t_data['description'],
                'difficulty': t_data['difficulty'],
                'test_cases': t_data['tests'],
                'hint_text': t_data.get('hint', ''),
            },
        )
        task.tags.set([tag_objs[s] for s in tag_slugs])
        return task

    def _upsert_variation(self, module, parent_task, order_idx, v_data, tag_objs):
        tag_slugs = v_data.get('tags', [])
        # Для вариаций тегов может не быть — наследуем теги родителя если пусто
        if not tag_slugs:
            tag_slugs = list(parent_task.tags.values_list('slug', flat=True))
        variation, _ = Task.objects.update_or_create(
            module=module, parent_task=parent_task, order=order_idx,
            defaults={
                'title': v_data['title'],
                'description': v_data['description'],
                'difficulty': v_data.get('difficulty', parent_task.difficulty),
                'test_cases': v_data['tests'],
                'hint_text': v_data.get('hint', ''),
            },
        )
        variation.tags.set([tag_objs[s] for s in tag_slugs if s in tag_objs])
        return variation
