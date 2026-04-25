# frozen_string_literal: true

require_relative "lib/ultimate_static_modal/version"

Gem::Specification.new do |spec|
  spec.name = "ultimate_static_modal"
  spec.version = UltimateStaticModal::VERSION
  spec.authors = ["Raghu Betina"]
  spec.email = ["raghu@firstdraft.com"]

  spec.summary = "Static-content companion to ultimate_turbo_modal."
  spec.description = "View helpers and Stimulus controllers for rendering ultimate_turbo_modal's <dialog> chrome on content that is not loaded via a Turbo Frame. Reuses UTMR's flavor classes; ships a small null-safe fork of UTMR's modal controller via an install generator."
  spec.homepage = "https://github.com/firstdraft/ultimate_static_modal"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.2"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = spec.homepage
  spec.metadata["changelog_uri"] = "#{spec.homepage}/blob/main/CHANGELOG.md"

  spec.files = Dir["lib/**/*", "VERSION", "README.md", "CHANGELOG.md", "LICENSE*"]
  spec.require_paths = ["lib"]

  spec.add_dependency "ultimate_turbo_modal", ">= 3.0"
end
