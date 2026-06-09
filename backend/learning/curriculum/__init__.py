"""Каталог учебной программы CodeMentor.

Каждый модуль программы определён в отдельном файле m01..m09 и экспортирует
константу MODULE: dict.

Структура MODULE:
    {
        'title': str,
        'description': str,
        'order': int,
        'theories': [
            {
                'title': str,
                'content': str (markdown),
                'order': int,
                'quiz': [
                    {'question', 'a', 'b', 'c', 'd', 'correct', 'explanation'},
                    ...
                ],
            },
            ...
        ],
        'tasks': [
            {
                'title': str,
                'description': str (markdown),
                'difficulty': 1|2|3,
                'tests': [{'input': str, 'expected': str}, ...],
                'hint': str,
                'tags': [tag_slug, ...],
                'order': int,
            },
            ...
        ],
    }
"""
from .tags import TAGS
from . import m01_basics, m02_arrays, m03_strings, m04_sorting
from . import m05_search, m06_stack_queue, m07_linked_list, m08_trees, m09_hash

CURRICULUM = [
    m01_basics.MODULE,
    m02_arrays.MODULE,
    m03_strings.MODULE,
    m04_sorting.MODULE,
    m05_search.MODULE,
    m06_stack_queue.MODULE,
    m07_linked_list.MODULE,
    m08_trees.MODULE,
    m09_hash.MODULE,
]
