from rest_framework import serializers
from .models import Module, Theory, Task, UserProgress, Quiz, QuizQuestion, Tag, MiniTask, TheoryProgress


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ('id', 'slug', 'name')


class MiniTaskSerializer(serializers.ModelSerializer):
    """Мини-задание для отдачи клиенту. Тест-кейсы НЕ возвращаются."""
    passed = serializers.SerializerMethodField()

    class Meta:
        model = MiniTask
        fields = ('id', 'title', 'description', 'starter_code', 'hint', 'order', 'passed')

    def get_passed(self, obj):
        user = self.context.get('user')
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        progress = self.context.get('theory_progress_map', {}).get(obj.theory_id)
        return bool(progress and obj.id in (progress.mini_tasks_passed or []))


class QuizQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        # correct не отдаём клиенту -- проверка на сервере
        fields = ('id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'order')


class QuizSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Quiz
        fields = ('id', 'questions')


class TheorySerializer(serializers.ModelSerializer):
    quiz = QuizSerializer(read_only=True)
    mini_tasks = MiniTaskSerializer(many=True, read_only=True)
    completed = serializers.SerializerMethodField()
    quiz_passed = serializers.SerializerMethodField()

    class Meta:
        model = Theory
        fields = ('id', 'title', 'content', 'order', 'quiz', 'mini_tasks', 'completed', 'quiz_passed')

    def get_completed(self, obj):
        user = self.context.get('user')
        if user and (user.is_staff or user.is_superuser):
            return True
        progress = self.context.get('theory_progress_map', {}).get(obj.id)
        return bool(progress and progress.is_completed())

    def get_quiz_passed(self, obj):
        user = self.context.get('user')
        if user and (user.is_staff or user.is_superuser):
            return True
        progress = self.context.get('theory_progress_map', {}).get(obj.id)
        return bool(progress and progress.quiz_passed)


class TaskSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    mastery = serializers.SerializerMethodField()
    is_variation = serializers.SerializerMethodField()
    parent_task_id = serializers.IntegerField(source='parent_task.id', read_only=True, allow_null=True)
    parent_task_title = serializers.CharField(source='parent_task.title', read_only=True, allow_null=True)
    variations_total = serializers.SerializerMethodField()
    variations_solved = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = (
            'id', 'title', 'description', 'difficulty', 'hint_text', 'order', 'tags',
            'mastery', 'is_variation', 'parent_task_id', 'parent_task_title',
            'variations_total', 'variations_solved',
        )

    def _user(self):
        user = self.context.get('user')
        if user is None:
            request = self.context.get('request')
            user = getattr(request, 'user', None) if request else None
        return user

    def get_mastery(self, obj):
        user = self._user()
        if not user or not user.is_authenticated:
            return 'not_attempted'
        from solutions.mastery import get_task_mastery
        return get_task_mastery(user, obj)

    def get_is_variation(self, obj):
        return obj.parent_task_id is not None

    def get_variations_total(self, obj):
        if obj.parent_task_id is not None:
            return 0
        return obj.variations.count()

    def get_variations_solved(self, obj):
        if obj.parent_task_id is not None:
            return 0
        user = self._user()
        if not user or not user.is_authenticated:
            return 0
        from solutions.mastery import has_any_accepted
        return sum(1 for v in obj.variations.all() if has_any_accepted(user, v))


class ModuleListSerializer(serializers.ModelSerializer):
    theory_count = serializers.IntegerField(source='theories.count', read_only=True)
    task_count = serializers.IntegerField(source='tasks.count', read_only=True)

    class Meta:
        model = Module
        fields = ('id', 'title', 'description', 'order', 'theory_count', 'task_count')


class ModuleDetailSerializer(serializers.ModelSerializer):
    theories = TheorySerializer(many=True, read_only=True)
    tasks = serializers.SerializerMethodField()
    tasks_unlocked = serializers.SerializerMethodField()

    class Meta:
        model = Module
        fields = ('id', 'title', 'description', 'order', 'theories', 'tasks', 'tasks_unlocked')

    def get_tasks(self, obj):
        # В общем списке модуля показываем только основные задачи (без вариаций),
        # в порядке возрастания сложности и порядка следования.
        user = self.context.get('user')
        is_admin = user and (user.is_staff or user.is_superuser)
        main_tasks = list(
            obj.tasks.filter(parent_task__isnull=True).order_by('difficulty', 'order')
        )
        serialized = TaskSerializer(main_tasks, many=True, context=self.context).data

        # Последовательная разблокировка: задача доступна только после того,
        # как предыдущая задача в порядке следования переведена в `mastered`.
        prev_mastered = True
        for data in serialized:
            if is_admin:
                data['locked'] = False
                continue
            data['locked'] = not prev_mastered
            prev_mastered = data.get('mastery') == 'mastered'
        return serialized

    def get_tasks_unlocked(self, obj):
        """Задачи модуля доступны только если все теории модуля пройдены полностью.
        Админы — всегда разблокированы."""
        user = self.context.get('user')
        if user and (user.is_staff or user.is_superuser):
            return True
        progress_map = self.context.get('theory_progress_map', {})
        for theory in obj.theories.all():
            tp = progress_map.get(theory.id)
            if tp is None or not tp.is_completed():
                return False
        return True


class UserProgressSerializer(serializers.ModelSerializer):
    module_title = serializers.CharField(source='module.title', read_only=True)
    module_id = serializers.IntegerField(source='module.id', read_only=True)

    class Meta:
        model = UserProgress
        fields = ('id', 'module_id', 'module_title', 'solved_count', 'updated_at')
