from django.contrib import admin
from .models import Module, Theory, Task, UserProgress, Quiz, QuizQuestion


class TheoryInline(admin.StackedInline):
    model = Theory
    extra = 1


class TaskInline(admin.StackedInline):
    model = Task
    extra = 1


class QuizQuestionInline(admin.StackedInline):
    model = QuizQuestion
    extra = 2


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('title', 'order', 'is_active')
    inlines = [TheoryInline, TaskInline]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'module', 'difficulty')
    list_filter = ('module', 'difficulty')


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ('theory',)
    inlines = [QuizQuestionInline]


@admin.register(UserProgress)
class UserProgressAdmin(admin.ModelAdmin):
    list_display = ('user', 'module', 'solved_count')
