# frozen_string_literal: true

require "ultimate_turbo_modal"
require_relative "ultimate_static_modal/version"
require_relative "ultimate_static_modal/railtie" if defined?(Rails::Railtie)

module UltimateStaticModal
  extend self

  class Error < StandardError; end

  def new(**opts)
    static_modal_class.new(**opts)
  end

  def static_modal_class
    flavor_class = UltimateTurboModal.modal_class
    static_subclasses[flavor_class] ||= build_static_subclass(flavor_class)
  end

  private

  def static_subclasses
    @static_subclasses ||= {}
  end

  def build_static_subclass(flavor_class)
    Class.new(flavor_class) do
      def view_template(&block)
        drawer? ? render_drawer(&block) : render_modal(&block)
      end
    end
  end
end
