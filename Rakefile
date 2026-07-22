# frozen_string_literal: true

require "rake/testtask"

Rake::TestTask.new do |test|
  test.libs << "test"
  test.pattern = "test/**/*_test.rb"
  test.warning = false
end

task default: :test
