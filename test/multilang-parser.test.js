import test from 'node:test';
import assert from 'node:assert/strict';
import { PythonParser } from '../scripts/parsers/python.mjs';
import { PhpParser } from '../scripts/parsers/php.mjs';
import { RubyParser } from '../scripts/parsers/ruby.mjs';

test('Python parser extracts imports and symbols through Tree-sitter', () => {
  const parser = new PythonParser();
  const content = `
from app.models import User, Role
import os, sys as system

class Foo:
    pass

async def run_job():
    return True
`;

  assert.deepEqual(parser.extractImports(content), ['app.models', 'os', 'sys']);
  assert.deepEqual(parser.extractSymbols(content), ['Foo', 'run_job']);
});

test('Ruby parser extracts requires and symbols through Tree-sitter', () => {
  const parser = new RubyParser();
  const content = `
require 'json'
require_relative './user'

module Api
  class User
    def self.find
    end

    def save
    end
  end
end
`;

  assert.deepEqual(parser.extractImports(content), ['json', './user']);
  assert.deepEqual(parser.extractSymbols(content), ['Api', 'User', 'find', 'save']);
});

test('PHP parser keeps extracting imports and symbols when Tree-sitter is unavailable', () => {
  const parser = new PhpParser();
  const content = `<?php
use App\\Models\\User as UserModel;
require_once 'boot.php';

class Controller {
  public function index() {}
}

function helper() {}
const FOO = 1;
`;

  assert.deepEqual(parser.extractImports(content), ['App\\Models\\User', 'boot.php']);
  assert.deepEqual(parser.extractSymbols(content), ['Controller', 'helper', 'FOO']);
});
