# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "rails"
require "tmpdir"
require "ultimate_turbo_modal"
require_relative "../lib/generators/ultimate_static_modal/install_generator"

class InstallGeneratorTest < Minitest::Test
  def test_registers_controllers_in_index_when_stimulus_starts_there
    run_generator(
      target: "index.js",
      files: {
        "index.js" => <<~JS
          import { Application } from "@hotwired/stimulus"

          const application = Application.start()
          application.debug = false
        JS
      }
    )
  end

  def test_registers_controllers_in_application_when_stimulus_starts_there
    run_generator(
      target: "application.js",
      files: {
        "index.js" => <<~JS,
          import { application } from "./application"
          import { eagerLoadControllersFrom } from "@hotwired/stimulus-loading"

          eagerLoadControllersFrom("controllers", application)
        JS
        "application.js" => <<~JS
          import { Application } from "@hotwired/stimulus"

          const application = Application.start()
          application.debug = false

          export { application }
        JS
      }
    )
  end

  private

  def run_generator(target:, files:)
    Dir.mktmpdir("ultimate-static-modal-generator-") do |root|
      controllers_path = File.join(root, "app", "javascript", "controllers")
      FileUtils.mkdir_p(controllers_path)
      files.each do |filename, content|
        File.write(File.join(controllers_path, filename), content)
      end

      upstream_generator = UltimateTurboModal::Generators::InstallGenerator.new(
        [],
        {},
        destination_root: root
      )
      upstream_generator.setup_stimulus_controller

      upstream_source = File.read(File.join(controllers_path, target))
      assert_includes upstream_source, "UltimateTurboModalController"

      UltimateStaticModal::Generators::InstallGenerator.start([], destination_root: root)

      source = File.read(File.join(controllers_path, target))
      assert_equal 1, source.scan('import ModalController from "./modal_controller"').length
      assert_equal 1, source.scan('application.register("modal", ModalController)').length
      assert_equal 1, source.scan('import StaticModalController from "./static_modal_controller"').length
      assert_equal 1, source.scan('application.register("static-modal", StaticModalController)').length
      refute_includes source, "UltimateTurboModalController"

      adapter = File.read(File.join(controllers_path, "modal_controller.js"))
      assert_includes adapter, "extends UltimateTurboModalController"
      assert File.exist?(File.join(controllers_path, "static_modal_controller.js"))
    end
  end
end
